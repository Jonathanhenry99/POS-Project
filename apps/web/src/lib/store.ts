import { useSyncExternalStore } from 'react';

/** Store reaktif minimal (tanpa library) untuk state global aplikasi. */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<T> | ((s: T) => T)) {
      state = typeof next === 'function' ? (next as (s: T) => T)(state) : { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export type Store<T> = ReturnType<typeof createStore<T>>;

/** Selector harus mengembalikan nilai yang stabil (bagian state, bukan objek baru). */
export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
