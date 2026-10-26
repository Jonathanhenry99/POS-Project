// Login, aktivasi perangkat, dan inisialisasi aplikasi.
import { can, verifyPin, type PublicUser } from '@mourden/shared';
import { api, setUnauthorizedHandler } from './api';
import { initBrand } from './brand';
import { kvDelete, kvGet, kvSet, type BootstrapData, type DeviceInfo } from './idb';
import { loadActiveShift } from './pos';
import { enterPreview, exitPreview, previewRequested } from './preview';
import { appStore } from './state';
import { refreshBootstrap, startSyncLoop } from './sync';
import { forgetMyAttendance } from './my-attendance';

const SESSION_KEY = 'mourden.session';
const OPERATOR_KEY = 'mourden.operator';
const OPERATOR_TOKEN_KEY = 'mourden.operator-token';

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
    let operatorToken: { userId: string; token: string } | null = null;
    try {
      operatorToken = JSON.parse(sessionStorage.getItem(OPERATOR_TOKEN_KEY) ?? 'null');
    } catch {
      operatorToken = null;
    }
    appStore.set({ mode: 'tablet', device, data, user: cached ? publicOf(cached) : null, operatorToken: operatorToken?.userId === cached?.id ? operatorToken : null });
    await loadActiveShift();
    appStore.set({ ready: true });
    startSyncLoop();
    void refreshBootstrap();
    return;
  }

  const session = readJson<{ token: string; user: PublicUser; mustSetPassword?: boolean }>(SESSION_KEY);
  appStore.set({ mode: 'online', token: session?.token ?? null, user: session?.user ?? null, mustSetPassword: !!session?.mustSetPassword });
  // Muat ulang saat pratinjau kasir: lanjutkan pratinjau (butuh koneksi untuk mengambil menu).
  const resume = session ? previewRequested() : null;
  if (resume) await enterPreview({ live: resume === 'live' }).catch(() => exitPreview());
  appStore.set({ ready: true });
  if (session) {
    // Perbarui data pengguna (peran bisa berubah); 401 otomatis mengeluarkan.
    api<{ user: PublicUser }>('/auth/me')
      .then(({ user }) => {
        writeLocal(SESSION_KEY, { ...readJson<object>(SESSION_KEY), token: appStore.get().token ?? session.token, user });
        appStore.set({ user });
      })
      .catch(() => {});
  }
}

function publicOf(u: PublicUser): PublicUser {
  return { id: u.id, name: u.name, username: u.username, role: u.role, active: u.active };
}

/** Cara masuk untuk username ini: 'password' (owner yang sudah membuat kata sandi) atau 'pin'. */
export async function loginMethod(username: string): Promise<'pin' | 'password'> {
  return (await api<{ method: 'pin' | 'password' }>(`/auth/method?username=${encodeURIComponent(username)}`, { anonymous: true })).method;
}

/** Login di HP/laptop (online): username + PIN, atau kata sandi untuk owner. Dicek server. */
export async function loginOnline(username: string, secret: { pin: string } | { password: string }) {
  const res = await api<{ token: string; user: PublicUser; mustSetPassword?: boolean }>('/auth/login', { method: 'POST', body: { username, ...secret }, anonymous: true });
  // Akun yang hanya bisa berjualan (kasir) tidak punya halaman di mode online: tolak sebelum sesi disimpan.
  if (!can(res.user.role, 'admin') && !can(res.user.role, 'stock.opname')) {
    throw new Error('Akun kasir hanya bisa dipakai di tablet kasir. Aktifkan tablet ini dulu lewat "Jadikan perangkat ini tablet kasir" (butuh PIN owner), lalu pilih nama kasir.');
  }
  writeLocal(SESSION_KEY, res);
  appStore.set({ token: res.token, user: res.user, mustSetPassword: !!res.mustSetPassword });
  return res.user;
}

/** Server memberi sesi baru (ganti kata sandi/PIN, keluar dari semua perangkat): sesi lama di perangkat ini diganti. */
export function replaceSessionToken(token: string, patch: { mustSetPassword?: boolean } = {}) {
  const cur = readJson<Record<string, unknown>>(SESSION_KEY) ?? {};
  writeLocal(SESSION_KEY, { ...cur, token, ...patch });
  appStore.set({ token, ...patch });
}

/** Membuktikan PIN operator tablet ke server, untuk membuka menu owner di tablet (butuh internet). */
export async function verifyOperator(pin: string) {
  const user = appStore.get().user;
  if (!user) throw new Error('Silakan login');
  const { token } = await api<{ token: string }>('/tablet/operator-token', { method: 'POST', body: { pin }, asDevice: true });
  const operatorToken = { userId: user.id, token };
  // Bertahan saat halaman dimuat ulang, hilang saat aplikasi ditutup; tokennya sendiri berlaku 12 jam di tablet ini.
  try {
    sessionStorage.setItem(OPERATOR_TOKEN_KEY, JSON.stringify(operatorToken));
  } catch {
    /* penyimpanan diblokir: token hanya di memori */
  }
  appStore.set({ operatorToken });
}

function forgetOperatorToken() {
  try {
    sessionStorage.removeItem(OPERATOR_TOKEN_KEY);
  } catch {
    /* tidak ada yang perlu dihapus */
  }
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
  forgetOperatorToken();
  appStore.set({ user: pub, operatorToken: null });
  // Owner di tablet: buktikan PIN ke server di latar supaya menu owner langsung bisa dibuka (bila online).
  if (can(pub.role, 'admin') && appStore.get().online) void verifyOperator(pin).catch(() => undefined);
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
  // Status absen milik akun ini tidak boleh terbawa ke akun berikutnya di HP yang sama.
  forgetMyAttendance();
  // Keluar dari pratinjau dulu supaya sesi owner (mode online) ikut dihapus di bawah.
  if (appStore.get().preview) void exitPreview();
  const s = appStore.get();
  if (s.mode === 'tablet') writeLocal(OPERATOR_KEY, null);
  else writeLocal(SESSION_KEY, null);
  forgetOperatorToken();
  appStore.set({ user: null, token: null, operatorToken: null, mustSetPassword: false });
}

// ---------- Aktivasi perangkat kasir ----------

/** `secret` = PIN owner (4-6 angka) atau kata sandi owner bila sudah dibuat. */
export async function pairDevice(username: string, secret: string, name: string) {
  const res = await api<{ device: Omit<DeviceInfo, 'token'>; token: string }>('/devices/pair', {
    method: 'POST',
    body: { username, name, ...(/^\d{4,6}$/.test(secret) ? { pin: secret } : { password: secret }) },
    // Aktivasi dibuktikan dengan PIN owner di isi permintaan. Token perangkat lama (bila tablet diaktifkan ulang
    // setelah aksesnya dicabut) tidak boleh ikut, karena server menolak permintaan bertoken tak dikenal.
    anonymous: true,
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
  appStore.set({ mode: 'online', device: null, data: null, user: null, activeShift: null, dataError: null });
}
