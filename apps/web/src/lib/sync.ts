// Sinkronisasi tablet kasir: tarik data awal (menu, pengguna, pengaturan) dan kirim antrean (outbox).
import { ApiError, api, errorMessage } from './api';
import { db, kvSet, type BootstrapData, type OutboxItem } from './idb';
import { appStore } from './state';

export async function refreshBootstrap(): Promise<boolean> {
  if (appStore.get().mode !== 'tablet' || appStore.get().preview) return false;
  try {
    const data = await api<Omit<BootstrapData, 'fetchedAt'> & { serverTime: string }>('/sync/bootstrap', { operatorId: '' });
    const { serverTime: _, ...rest } = data;
    const next: BootstrapData = { ...rest, fetchedAt: new Date().toISOString() };
    await kvSet('bootstrap', next);
    appStore.set({ data: next, online: true });
    // Pengguna yang sedang login dinonaktifkan owner -> keluar.
    const user = appStore.get().user;
    if (user && !next.users.some((u) => u.id === user.id)) appStore.set({ user: null });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) appStore.set({ online: false });
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
  // Mode pratinjau: antrean tetap lokal, tidak pernah dikirim ke server.
  if (appStore.get().mode !== 'tablet' || appStore.get().preview) return Promise.resolve();
  flushing ??= (async () => {
    appStore.set((s) => ({ ...s, sync: { ...s.sync, syncing: true } }));
    try {
      const d = await db();
      for (;;) {
        const item = await d.getFromIndex('outbox', 'byStatus', 'pending');
        if (!item) break;
        try {
          await api(item.path, { method: item.method, body: item.body, operatorId: item.operatorId });
          await d.delete('outbox', item.seq!);
          await markRef(item, 'synced');
          appStore.set((s) => ({ ...s, online: true, sync: { ...s.sync, lastSyncAt: new Date().toISOString(), lastError: '' } }));
        } catch (e) {
          const msg = errorMessage(e);
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

export async function listOutbox(): Promise<OutboxItem[]> {
  return (await db()).getAll('outbox');
}

let started = false;

/** Loop sinkron: saat online kembali, saat aplikasi dibuka lagi, dan berkala. */
export function startSyncLoop() {
  if (started) return;
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
    if (document.visibilityState === 'visible') kick();
  });
  setInterval(kick, 20_000);
  setInterval(() => void refreshBootstrap(), 5 * 60_000);
  void updateCounts().then(kick);
}
