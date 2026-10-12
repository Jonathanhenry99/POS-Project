// Mode pratinjau kasir: owner mencoba layar kasir dari HP/laptop tanpa mengaktifkan perangkat.
// Menu & pengaturan asli diambil dari server, tetapi shift/transaksi disimpan di database lokal terpisah,
// tidak pernah dikirim ke server (outbox tidak di-flush) dan tidak dicetak (struk hanya ditampilkan).
import { can, type AppSettings, type Catalog, type Ingredient, type PublicUser } from '@mourden/shared';
import { api } from './api';
import { LIVE_TEST_DB, MAIN_DB, PREVIEW_DB, deleteDatabase, useDatabase, type BootstrapData, type DeviceInfo } from './idb';
import { startSyncLoop, updateCounts } from './sync';
import { loadActiveShift } from './pos';
import { appStore } from './state';

export const PREVIEW_DEVICE: DeviceInfo = { id: '00000000-0000-4000-8000-00000000beef', name: 'Pratinjau kasir', code: 'P', token: '' };
const FLAG = 'mourden.preview';

/** 'sim' = simulasi, 'live' = uji langsung, null = tidak sedang pratinjau. */
export function previewRequested(): 'sim' | 'live' | null {
  try {
    const v = sessionStorage.getItem(FLAG);
    return v === 'live' ? 'live' : v === '1' ? 'sim' : null;
  } catch {
    return null;
  }
}

function setFlag(mode: 'sim' | 'live' | null) {
  try {
    if (mode) sessionStorage.setItem(FLAG, mode === 'live' ? 'live' : '1');
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* pratinjau tetap jalan selama halaman terbuka */
  }
}

/**
 * Perangkat uji owner dari server. Token selalu diminta baru saat masuk uji langsung (token lama hangus),
 * jadi tidak perlu disimpan dan sesi uji di browser lain otomatis berhenti mengirim.
 */
async function testDevice(): Promise<DeviceInfo> {
  const res = await api<{ device: Omit<DeviceInfo, 'token'>; token: string }>('/devices/test', { method: 'POST' });
  // Nomor struk = kode perangkat + tanggal + urutan lokal. Perangkat uji dipakai bersama oleh semua browser owner,
  // jadi tiap browser menambahkan kode acak sendiri agar urutan lokalnya tidak bentrok (mis. laptop & HP).
  return { ...res.device, code: `${res.device.code}${installSuffix()}`, token: res.token };
}

const SUFFIX_KEY = 'mourden.uji-suffix';
function installSuffix(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  try {
    let v = localStorage.getItem(SUFFIX_KEY);
    if (!v) localStorage.setItem(SUFFIX_KEY, (v = make()));
    return v;
  } catch {
    return make();
  }
}

/** Katalog seperti yang diterima tablet: hanya kategori, produk, grup & pilihan yang aktif. */
export function activeCatalog(c: Catalog): Catalog {
  const categories = c.categories.filter((x) => x.active);
  const optionGroups = c.optionGroups.map((g) => ({ ...g, options: g.options.filter((o) => o.active) })).filter((g) => g.options.length && (g as { active?: boolean }).active !== false);
  const groupIds = new Set(optionGroups.map((g) => g.id));
  const catIds = new Set(categories.map((x) => x.id));
  const products = c.products.filter((p) => p.active && catIds.has(p.categoryId)).map((p) => ({ ...p, optionGroupIds: p.optionGroupIds.filter((id) => groupIds.has(id)) }));
  return { categories, products, optionGroups };
}

const IDLE_SYNC = { pending: 0, failed: 0, syncing: false, lastSyncAt: null, lastError: '' };

export async function enterPreview(opts: { live?: boolean } = {}) {
  const s = appStore.get();
  if (s.preview) return;
  if (s.mode !== 'online' || !s.user || !can(s.user.role, 'admin')) throw new Error('Pratinjau kasir hanya untuk owner di HP/laptop');
  const [settings, catalog, ingredients, staff] = await Promise.all([
    api<AppSettings>('/settings'),
    api<Catalog>('/admin/catalog'),
    api<Ingredient[]>('/ingredients').catch(() => [] as Ingredient[]),
    api<PublicUser[]>('/users').catch(() => [] as PublicUser[]),
  ]);
  // Daftar karyawan aktif dibutuhkan untuk menguji komplimen. Hash PIN tidak dikirim server ke sesi HP,
  // jadi di pratinjau PIN penerima komplimen tidak diminta.
  const others = staff.filter((u) => u.active && u.id !== s.user!.id).map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, pinHash: '' }));
  const data: BootstrapData = {
    settings,
    catalog: activeCatalog(catalog),
    ingredients,
    users: [{ ...s.user, pinHash: '' }, ...others],
    fetchedAt: new Date().toISOString(),
  };
  const device = opts.live ? await testDevice() : PREVIEW_DEVICE;
  await useDatabase(opts.live ? LIVE_TEST_DB : PREVIEW_DB);
  setFlag(opts.live ? 'live' : 'sim');
  appStore.set({ preview: true, previewLive: !!opts.live, mode: 'tablet', device, data, activeShift: null, sync: IDLE_SYNC });
  await loadActiveShift();
  if (opts.live) {
    await updateCounts();
    startSyncLoop();
  }
}

/**
 * Pindah antara simulasi dan uji langsung tanpa meninggalkan layar kasir (mode tetap 'tablet',
 * hanya perangkat & database lokalnya yang berganti).
 */
export async function setPreviewLive(live: boolean) {
  const s = appStore.get();
  if (!s.preview || s.previewLive === live) return;
  const device = live ? await testDevice() : PREVIEW_DEVICE;
  await useDatabase(live ? LIVE_TEST_DB : PREVIEW_DB);
  if (live) await deleteDatabase(PREVIEW_DB);
  setFlag(live ? 'live' : 'sim');
  appStore.set({ previewLive: live, device, activeShift: null, sync: IDLE_SYNC });
  await loadActiveShift();
  if (live) {
    await updateCounts();
    startSyncLoop();
  }
}

async function leavePreview() {
  const wasLive = appStore.get().previewLive;
  appStore.set({ preview: false, previewLive: false, mode: 'online', device: null, data: null, activeShift: null, sync: IDLE_SYNC });
  await useDatabase(MAIN_DB);
  // Data simulasi dibuang; data uji langsung dipertahankan (shift berjalan & antrean yang belum terkirim).
  if (!wasLive) await deleteDatabase(PREVIEW_DB);
}

/** Keluar pratinjau, kembali ke mode HP/laptop biasa. */
export async function exitPreview() {
  setFlag(null);
  if (!appStore.get().preview) return;
  await leavePreview();
}
