import type { PublicUser, Shift } from '@mourden/shared';
import type { BootstrapData, DeviceInfo } from './idb';
import { createStore, useStore } from './store';

/**
 * tablet = perangkat kasir yang sudah diaktifkan (offline-first, data di IndexedDB).
 * online = HP/laptop owner atau barista (data langsung dari server).
 */
export type AppMode = 'tablet' | 'online';

export interface AppState {
  ready: boolean;
  mode: AppMode;
  /** Owner mencoba layar kasir dari HP/laptop: data lokal terpisah, tidak pernah dikirim ke server atau printer. */
  preview: boolean;
  /**
   * Uji langsung: pratinjau kasir yang BENAR-BENAR menyimpan ke server lewat perangkat uji owner
   * (untuk menguji alur nyata dari HP/laptop). Cetak tetap hanya ditampilkan di layar.
   */
  previewLive: boolean;
  device: DeviceInfo | null;
  data: BootstrapData | null;
  user: PublicUser | null;
  /** Token sesi untuk mode online. */
  token: string | null;
  /** Bukti PIN operator tablet dari server (12 jam), dibutuhkan untuk menu owner di tablet. Hanya di memori. */
  operatorToken: { userId: string; token: string } | null;
  /** Owner login online dengan PIN tetapi belum punya kata sandi: wajib membuatnya dulu. */
  mustSetPassword: boolean;
  online: boolean;
  activeShift: Shift | null;
  sync: { pending: number; failed: number; syncing: boolean; lastSyncAt: string | null; lastError: string };
  /** Alasan terakhir data menu gagal diperbarui padahal internet ada. `rejected` = server menolak tablet ini (akses dicabut). */
  dataError: { rejected: boolean; message: string } | null;
}

export const appStore = createStore<AppState>({
  ready: false,
  mode: 'online',
  preview: false,
  previewLive: false,
  device: null,
  data: null,
  user: null,
  token: null,
  operatorToken: null,
  mustSetPassword: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  activeShift: null,
  sync: { pending: 0, failed: 0, syncing: false, lastSyncAt: null, lastError: '' },
  dataError: null,
});

export const useApp = <S,>(selector: (s: AppState) => S) => useStore(appStore, selector);

/**
 * Tutup kasir buta: kasir (bukan owner) tidak melihat uang laci "seharusnya" maupun rincian tunai
 * selama shift berjalan, supaya hitungan saat tutup kasir tidak bisa disesuaikan.
 */
export const useBlindCash = () => useApp((s) => (s.data?.settings.policy.blindCashClose ?? true) && s.user?.role !== 'owner');
