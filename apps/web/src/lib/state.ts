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
  device: DeviceInfo | null;
  data: BootstrapData | null;
  user: PublicUser | null;
  /** Token sesi untuk mode online. */
  token: string | null;
  online: boolean;
  activeShift: Shift | null;
  sync: { pending: number; failed: number; syncing: boolean; lastSyncAt: string | null; lastError: string };
}

export const appStore = createStore<AppState>({
  ready: false,
  mode: 'online',
  preview: false,
  device: null,
  data: null,
  user: null,
  token: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  activeShift: null,
  sync: { pending: 0, failed: 0, syncing: false, lastSyncAt: null, lastError: '' },
});

export const useApp = <S,>(selector: (s: AppState) => S) => useStore(appStore, selector);
