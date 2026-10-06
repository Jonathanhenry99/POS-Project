// Login, aktivasi perangkat, dan inisialisasi aplikasi.
import { can, verifyPin, type PublicUser } from '@mourden/shared';
import { api, setUnauthorizedHandler } from './api';
import { initBrand } from './brand';
import { kvDelete, kvGet, kvSet, type BootstrapData, type DeviceInfo } from './idb';
import { loadActiveShift } from './pos';
import { enterPreview, exitPreview, previewRequested } from './preview';
import { appStore } from './state';
import { refreshBootstrap, startSyncLoop } from './sync';

const SESSION_KEY = 'mourden.session';
const OPERATOR_KEY = 'mourden.operator';

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan diblokir: sesi hanya bertahan selama halaman terbuka */
  }
}

export async function initApp() {
  setUnauthorizedHandler(() => {
    writeLocal(SESSION_KEY, null);
    appStore.set({ user: null, token: null });
  });
  initBrand();

  const device = await kvGet<DeviceInfo>('device');
  if (device) {
    const data = (await kvGet<BootstrapData>('bootstrap')) ?? null;
    const operatorId = readJson<string>(OPERATOR_KEY);
    const cached = data?.users.find((u) => u.id === operatorId);
    appStore.set({ mode: 'tablet', device, data, user: cached ? publicOf(cached) : null });
    await loadActiveShift();
    appStore.set({ ready: true });
    startSyncLoop();
    void refreshBootstrap();
    return;
  }

  const session = readJson<{ token: string; user: PublicUser }>(SESSION_KEY);
  appStore.set({ mode: 'online', token: session?.token ?? null, user: session?.user ?? null });
  // Muat ulang saat pratinjau kasir: lanjutkan pratinjau (butuh koneksi untuk mengambil menu).
  if (session && previewRequested()) await enterPreview().catch(() => exitPreview());
  appStore.set({ ready: true });
  if (session) {
    // Perbarui data pengguna (peran bisa berubah); 401 otomatis mengeluarkan.
    api<{ user: PublicUser }>('/auth/me')
      .then(({ user }) => {
        writeLocal(SESSION_KEY, { token: session.token, user });
        appStore.set({ user });
      })
      .catch(() => {});
  }
}

function publicOf(u: PublicUser): PublicUser {
  return { id: u.id, name: u.name, username: u.username, role: u.role, active: u.active };
}

/** Login di HP/laptop (online): username + PIN dicek server. */
export async function loginOnline(username: string, pin: string) {
  const res = await api<{ token: string; user: PublicUser }>('/auth/login', { method: 'POST', body: { username, pin } });
  // Akun yang hanya bisa berjualan (kasir) tidak punya halaman di mode online: tolak sebelum sesi disimpan.
  if (!can(res.user.role, 'admin') && !can(res.user.role, 'stock.opname')) {
    throw new Error('Akun kasir hanya bisa dipakai di tablet kasir. Aktifkan tablet ini dulu lewat "Jadikan perangkat ini tablet kasir" (butuh PIN owner), lalu pilih nama kasir.');
  }
  writeLocal(SESSION_KEY, res);
  appStore.set({ token: res.token, user: res.user });
  return res.user;
}

// ---------- Login PIN di tablet (bisa offline) ----------

const localFails = new Map<string, { n: number; until: number }>();

export async function loginTablet(userId: string, pin: string): Promise<PublicUser> {
  const lock = localFails.get(userId);
  if (lock && lock.until > Date.now()) {
    throw new Error(`Terlalu banyak percobaan. Tunggu ${Math.ceil((lock.until - Date.now()) / 1000)} detik.`);
  }
  const user = appStore.get().data?.users.find((u) => u.id === userId);
  if (!user) throw new Error('Pengguna tidak ditemukan');
  if (!(await verifyPin(pin, user.pinHash))) {
    const f = localFails.get(userId) ?? { n: 0, until: 0 };
    f.n++;
    if (f.n >= 5) {
      f.n = 0;
      f.until = Date.now() + 60_000;
    }
    localFails.set(userId, f);
    throw new Error('PIN salah');
  }
  localFails.delete(userId);
  const pub = publicOf(user);
  writeLocal(OPERATOR_KEY, pub.id);
  appStore.set({ user: pub });
  return pub;
}

/** Verifikasi PIN owner di tablet untuk persetujuan (void, diskon besar) tanpa mengganti operator. */
export async function verifyOwnerPin(pin: string): Promise<PublicUser | null> {
  for (const u of appStore.get().data?.users ?? []) {
    if (u.role === 'owner' && u.pinHash && (await verifyPin(pin, u.pinHash))) return publicOf(u);
  }
  return null;
}

export function logout() {
  // Keluar dari pratinjau dulu supaya sesi owner (mode online) ikut dihapus di bawah.
  if (appStore.get().preview) void exitPreview();
  const s = appStore.get();
  if (s.mode === 'tablet') writeLocal(OPERATOR_KEY, null);
  else writeLocal(SESSION_KEY, null);
  appStore.set({ user: null, token: null });
}

// ---------- Aktivasi perangkat kasir ----------

export async function pairDevice(username: string, pin: string, name: string) {
  const res = await api<{ device: Omit<DeviceInfo, 'token'>; token: string }>('/devices/pair', {
    method: 'POST',
    body: { username, pin, name },
  });
  const device: DeviceInfo = { ...res.device, token: res.token };
  await kvSet('device', device);
  writeLocal(SESSION_KEY, null);
  appStore.set({ mode: 'tablet', device, user: null, token: null });
  const ok = await refreshBootstrap();
  if (!ok) throw new Error('Perangkat aktif, tetapi gagal mengambil data menu. Coba lagi.');
  startSyncLoop();
  return device;
}

/** Melepas aktivasi tablet (data lokal yang belum tersinkron ikut terhapus — cek dulu antreannya). */
export async function unpairDevice() {
  await kvDelete('device');
  await kvDelete('bootstrap');
  writeLocal(OPERATOR_KEY, null);
  appStore.set({ mode: 'online', device: null, data: null, user: null, activeShift: null });
}
