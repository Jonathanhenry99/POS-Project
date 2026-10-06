// Mode pratinjau kasir: owner mencoba layar kasir dari HP/laptop tanpa mengaktifkan perangkat.
// Menu & pengaturan asli diambil dari server, tetapi shift/transaksi disimpan di database lokal terpisah,
// tidak pernah dikirim ke server (outbox tidak di-flush) dan tidak dicetak (struk hanya ditampilkan).
import { can, type AppSettings, type Catalog, type Ingredient } from '@mourden/shared';
import { api } from './api';
import { MAIN_DB, PREVIEW_DB, deleteDatabase, useDatabase, type BootstrapData, type DeviceInfo } from './idb';
import { loadActiveShift } from './pos';
import { appStore } from './state';

export const PREVIEW_DEVICE: DeviceInfo = { id: '00000000-0000-4000-8000-00000000beef', name: 'Pratinjau kasir', code: 'P', token: '' };
const FLAG = 'mourden.preview';

export function previewRequested(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

function setFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FLAG, '1');
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* pratinjau tetap jalan selama halaman terbuka */
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

export async function enterPreview() {
  const s = appStore.get();
  if (s.preview) return;
  if (s.mode !== 'online' || !s.user || !can(s.user.role, 'admin')) throw new Error('Pratinjau kasir hanya untuk owner di HP/laptop');
  const [settings, catalog, ingredients] = await Promise.all([
    api<AppSettings>('/settings'),
    api<Catalog>('/admin/catalog'),
    api<Ingredient[]>('/ingredients').catch(() => [] as Ingredient[]),
  ]);
  const data: BootstrapData = {
    settings,
    catalog: activeCatalog(catalog),
    ingredients,
    // Owner sudah login; hash PIN tidak dibutuhkan (dan tidak dikirim server ke sesi HP).
    users: [{ ...s.user, pinHash: '' }],
    fetchedAt: new Date().toISOString(),
  };
  await useDatabase(PREVIEW_DB);
  setFlag(true);
  appStore.set({ preview: true, mode: 'tablet', device: PREVIEW_DEVICE, data, activeShift: null });
  await loadActiveShift();
}

/** Keluar pratinjau: data simulasi dihapus, kembali ke mode HP/laptop biasa. */
export async function exitPreview() {
  setFlag(false);
  if (!appStore.get().preview) return;
  appStore.set({ preview: false, mode: 'online', device: null, data: null, activeShift: null, sync: { pending: 0, failed: 0, syncing: false, lastSyncAt: null, lastError: '' } });
  await useDatabase(MAIN_DB);
  await deleteDatabase(PREVIEW_DB);
}
