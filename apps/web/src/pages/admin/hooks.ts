import { useCallback, useEffect, useState } from 'react';
import { businessDate } from '@mourden/shared';
import { api, errorMessage } from '../../lib/api';
import { appStore } from '../../lib/state';

/** Ambil data dari API dengan status loading/error dan fungsi muat ulang. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api<T>(path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, n]);

  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, loading, reload, setData };
}

export function storeTimezone(): string {
  return appStore.get().data?.settings.store.timezone ?? 'Asia/Jakarta';
}

export function today(): string {
  return businessDate(new Date().toISOString(), storeTimezone());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
