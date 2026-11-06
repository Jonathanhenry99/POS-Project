// Sinkronisasi tablet kasir: tarik data awal (menu, pengguna, pengaturan) dan kirim antrean (outbox).
import { ApiError, api, errorMessage } from './api';
import { db, kvGet, kvSet, type BootstrapData, type OutboxItem } from './idb';
import { appStore } from './state';

export async function refreshBootstrap(): Promise<boolean> {
  if (appStore.get().mode !== 'tablet' || appStore.get().preview) return false;
  try {
    const data = await api<Omit<BootstrapData, 'fetchedAt'> & { serverTime: string }>('/sync/bootstrap', { operatorId: '' });
    const { serverTime: _, ...rest } = data;
    const next: BootstrapData = { ...rest, fetchedAt: new Date().toISOString() };
    // Owner mengosongkan data penjualan: data lokal dari sebelum itu dibuang dulu, lalu aplikasi dimuat ulang.
    if (await adoptDataEpoch(next.dataEpoch ?? null)) {
      await kvSet('bootstrap', next);
      reloadAfterWipe();
      return true;
    }
    await kvSet('bootstrap', next);
    appStore.set({ data: next, online: true, dataError: null });
    // Samakan shift/hari dengan server (ditutup owner dari back office, atau shift terbuka yang hilang dari tablet).
    void import('./pos').then((m) => m.syncShiftWithServer());
    // Pengguna yang sedang login dinonaktifkan owner -> keluar.
    const user = appStore.get().user;
    if (user && !next.users.some((u) => u.id === user.id)) appStore.set({ user: null });
    return true;
  } catch (e) {
    // Putus internet cukup ditandai offline. Penolakan server (mis. akses tablet dicabut) harus terlihat kasir,
    // kalau tidak menu lama terus dipakai tanpa ada yang tahu sebabnya.
    if (e instanceof ApiError && e.status === 0) appStore.set({ online: false });
    else appStore.set({ dataError: { rejected: e instanceof ApiError && e.status === 401, message: errorMessage(e) } });
    return false;
  }
}

const EPOCH_KEY = 'dataEpoch';
const WIPED_FLAG = 'mourden.data-wiped';

/** Pesan server bila tablet mengirim data dari sebelum data penjualan dikosongkan (lihat STALE_EPOCH di server). */
export function isStaleEpoch(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409 && e.message.includes('sebelum data penjualan dikosongkan');
}

/**
 * Bila versi data server berbeda dari versi data lokal, hapus salinan lokal penjualan & buka/tutup toko
 * (transaksi, shift, hari usaha, antrean kirim, antrean cetak, keranjang, nomor struk). Perangkat, menu,
 * pengaturan printer dan absensi lokal tetap. Mengembalikan true bila ada yang dihapus.
 */
export async function adoptDataEpoch(epoch: string | null): Promise<boolean> {
  if (!epoch) return false;
  const local = await kvGet<string>(EPOCH_KEY);
  if (local === epoch) return false;
  const d = await db();
  const t = d.transaction(['kv', 'orders', 'shifts', 'businessDays', 'outbox', 'printJobs'], 'readwrite');
  await Promise.all([t.objectStore('orders').clear(), t.objectStore('shifts').clear(), t.objectStore('businessDays').clear(), t.objectStore('outbox').clear(), t.objectStore('printJobs').clear()]);
  const kv = t.objectStore('kv');
  for (const key of await kv.getAllKeys()) {
    const k = String(key);
    if (k.startsWith('seq:') || ['activeShiftId', 'activeBusinessDayId', 'lastClosedShiftId'].includes(k)) await kv.delete(key);
  }
  await kv.put(epoch, EPOCH_KEY);
  await t.done;
  try {
    for (const k of ['mourden.cart', 'mourden.saved', 'mourden.order-session']) localStorage.removeItem(k);
    sessionStorage.setItem(WIPED_FLAG, '1');
  } catch {
    /* penyimpanan diblokir: keranjang di memori hilang saat dimuat ulang */
  }
  appStore.set({ activeShift: null });
  return true;
}

function reloadAfterWipe() {
  if (typeof window !== 'undefined') window.location.reload();
}

/** Satu kali setelah dimuat ulang karena data penjualan dikosongkan: beri tahu pengguna tablet. */
export function consumeWipedNotice(): boolean {
  try {
    const was = sessionStorage.getItem(WIPED_FLAG) === '1';
    sessionStorage.removeItem(WIPED_FLAG);
    return was;
  } catch {
    return false;
  }
}

export async function enqueue(item: Omit<OutboxItem, 'createdAt' | 'attempts' | 'lastError' | 'status'>) {
  await (await db()).add('outbox', { ...item, createdAt: new Date().toISOString(), attempts: 0, lastError: '', status: 'pending' });
  await updateCounts();
  void flushOutbox();
}

export async function updateCounts() {
  const d = await db();
  const [pending, failed] = await Promise.all([d.countFromIndex('outbox', 'byStatus', 'pending'), d.countFromIndex('outbox', 'byStatus', 'failed')]);
  appStore.set((s) => ({ ...s, sync: { ...s.sync, pending, failed } }));
}

async function markRef(item: OutboxItem, sync: 'synced' | 'failed', error = '') {
  if (!item.ref) return;
  const d = await db();
  if (item.ref.store === 'orders') {
    const o = await d.get('orders', item.ref.id);
    if (o) await d.put('orders', { ...o, sync, syncError: error });
  } else if (item.ref.store === 'shifts') {
    const s = await d.get('shifts', item.ref.id);
    if (s) await d.put('shifts', { ...s, sync });
  } else {
    const day = await d.get('businessDays', item.ref.id);
    const remaining = (await d.getAll('outbox')).filter((job) => job.ref?.store === 'businessDays' && job.ref.id === item.ref!.id);
    const failed = remaining.find((job) => job.status === 'failed');
    if (day) await d.put('businessDays', { ...day, sync: failed ? 'failed' : remaining.length ? 'pending' : sync, syncError: failed?.lastError ?? error });
  }
}

let flushing: Promise<void> | null = null;

/** Kirim antrean berurutan. Berhenti saat jaringan/server bermasalah agar urutan tetap terjaga. */
export function flushOutbox(): Promise<void> {
  // Mode pratinjau (simulasi): antrean tetap lokal, tidak pernah dikirim. "Uji langsung" mengirim seperti tablet.
  if (appStore.get().mode !== 'tablet' || (appStore.get().preview && !appStore.get().previewLive)) return Promise.resolve();
  flushing ??= (async () => {
    let stale = false;
    appStore.set((s) => ({ ...s, sync: { ...s.sync, syncing: true } }));
    try {
      const d = await db();
      for (;;) {
        const item = await d.getFromIndex('outbox', 'byStatus', 'pending');
        if (!item) break;
        try {
          await api(item.path, { method: item.method, body: item.body, operatorId: item.operatorId, asDevice: true });
          await d.delete('outbox', item.seq!);
          await markRef(item, 'synced');
          appStore.set((s) => ({ ...s, online: true, sync: { ...s.sync, lastSyncAt: new Date().toISOString(), lastError: '' } }));
        } catch (e) {
          const msg = errorMessage(e);
          if (isStaleEpoch(e)) {
            // Data lokal dari sebelum reset: berhenti, segarkan (membuang data lama), jangan tandai gagal.
            stale = true;
            break;
          }
          if (e instanceof ApiError && !e.retryable) {
            // Ditolak server (data tidak valid): tandai gagal, lanjutkan antrean lain.
            await d.put('outbox', { ...item, status: 'failed', attempts: item.attempts + 1, lastError: msg });
            await markRef(item, 'failed', msg);
            continue;
          }
          await d.put('outbox', { ...item, attempts: item.attempts + 1, lastError: msg });
          appStore.set((s) => ({ ...s, online: !(e instanceof ApiError && e.status === 0), sync: { ...s.sync, lastError: msg } }));
          break;
        }
      }
    } finally {
      await updateCounts();
      appStore.set((s) => ({ ...s, sync: { ...s.sync, syncing: false } }));
      flushing = null;
    }
    // Kiriman yang ditolak server dilaporkan ke back office supaya owner tahu alasannya dari jauh.
    void import('./pos').then((m) => m.reportSyncIssues());
    if (stale) await (appStore.get().previewLive ? refreshPreviewEpoch() : refreshBootstrap());
  })();
  return flushing;
}

/** Kirim ulang item yang gagal (mis. setelah owner memperbaiki data di server). */
export async function retryFailed() {
  const d = await db();
  const failed = await d.getAllFromIndex('outbox', 'byStatus', 'failed');
  for (const item of failed) await d.put('outbox', { ...item, status: 'pending' });
  await updateCounts();
  await flushOutbox();
}

/**
 * Buang satu kiriman yang ditolak server (mis. tutup shift yang sudah ditutup paksa owner dari back office).
 * Transaksi tidak bisa dibuang: transaksi yang gagal harus tetap ada sampai masalahnya beres.
 */
export async function discardFailed(seq: number) {
  const d = await db();
  const item = await d.get('outbox', seq);
  if (!item || item.status !== 'failed') return;
  if (item.ref?.store === 'orders') throw new Error('Transaksi yang gagal tidak bisa dibuang. Hubungi owner.');
  await d.delete('outbox', seq);
  await updateCounts();
  void import('./pos').then((m) => m.reportSyncIssues());
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return (await db()).getAll('outbox');
}

let started = false;

/** Loop sinkron: saat online kembali, saat aplikasi dibuka lagi, dan berkala. */
export function startSyncLoop() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const kick = () => {
    void flushOutbox();
  };
  window.addEventListener('online', () => {
    appStore.set({ online: true });
    void refreshBootstrap();
    kick();
  });
  window.addEventListener('offline', () => appStore.set({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Saat tablet dibuka lagi: ambil data terbaru dulu (termasuk versi data bila owner mengosongkan penjualan).
    void refreshBootstrap().then(kick);
  });
  setInterval(kick, 20_000);
  setInterval(() => void refreshBootstrap(), 5 * 60_000);
  void updateCounts().then(kick);
}

/** Pratinjau "Uji langsung" owner: data uji lokal juga mengikuti versi data penjualan server. */
export async function refreshPreviewEpoch(): Promise<void> {
  try {
    const { id } = await api<{ id: string | null }>('/data-epoch');
    const s = appStore.get();
    if (s.data && id) appStore.set({ data: { ...s.data, dataEpoch: id } });
    if (await adoptDataEpoch(id)) reloadAfterWipe();
  } catch {
    /* coba lagi pada pengiriman berikutnya */
  }
}
