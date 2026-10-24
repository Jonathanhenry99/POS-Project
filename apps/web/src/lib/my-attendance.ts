// Absen dari HP karyawan (akun barista/kitchen yang login online). Berbeda dengan tablet, absen ini langsung
// dikirim ke server: jam memakai jam server dan lokasi diperiksa di sana.
import { useEffect, useState } from 'react';
import type { GeoPoint } from '@mourden/shared';
import { api } from './api';
import { uuid } from './id';

export interface MyAttendanceDay {
  date: string;
  clockedAt: string;
  lateMinutes: number;
  source: 'tablet' | 'hp';
  distanceM: number | null;
}

export interface MyAttendance {
  enabled: boolean;
  /** Akun ini wajib absen dulu sebelum membuka halaman kerja (owner tidak). */
  required: boolean;
  startTime: string;
  graceMinutes: number;
  location: { set: boolean; radiusM: number; lat: number | null; lng: number | null };
  storeName: string;
  timezone: string;
  today: MyAttendanceDay | null;
  history: MyAttendanceDay[];
  serverTime: string;
}

// Satu salinan untuk seluruh aplikasi: pintu masuk halaman stok dan layar absen memakai data yang sama,
// jadi setelah absen berhasil tidak perlu memuat ulang untuk lewat.
let cached: { data: MyAttendance; at: number; offset: number } | null = null;
let inflight: Promise<MyAttendance> | null = null;
const listeners = new Set<() => void>();
const FRESH_MS = 60_000;

export function loadMyAttendance(force = false): Promise<MyAttendance> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.data);
  inflight ??= api<MyAttendance>('/me/attendance')
    .then((data) => {
      cached = { data, at: Date.now(), offset: new Date(data.serverTime).getTime() - Date.now() };
      listeners.forEach((l) => l());
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function forgetMyAttendance() {
  cached = null;
}

/** Selisih jam server dan jam HP (ms). Jam layar absen mengikuti server, sama seperti yang dicatat. */
export function serverOffset(): number {
  return cached?.offset ?? 0;
}

/** `enabled = false` (mis. owner atau tablet) tidak memuat apa pun. */
export function useMyAttendance(enabled: boolean) {
  const [state, setState] = useState<{ data: MyAttendance | null; error: string; loading: boolean }>(() => ({ data: enabled ? (cached?.data ?? null) : null, error: '', loading: enabled && !cached }));
  useEffect(() => {
    if (!enabled) return;
    const sync = () => cached && setState({ data: cached.data, error: '', loading: false });
    listeners.add(sync);
    loadMyAttendance().then(sync, (e: Error) => setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      listeners.delete(sync);
    };
  }, [enabled]);
  return { ...state, reload: () => loadMyAttendance(true) };
}

export async function submitMyAttendance(photo: string, location: GeoPoint | null): Promise<MyAttendanceDay> {
  const res = await api<{ status: 'created' | 'exists'; clockedAt: string; lateMinutes: number }>(`/me/attendance/${uuid()}`, { method: 'PUT', body: { photo, location } });
  await loadMyAttendance(true).catch(() => undefined);
  return cached?.data.today ?? { date: '', clockedAt: res.clockedAt, lateMinutes: res.lateMinutes, source: 'hp', distanceM: null };
}

export type LocationState = { kind: 'locating' } | { kind: 'ok'; at: GeoPoint } | { kind: 'denied' } | { kind: 'unavailable' };

/** Lokasi saat ini dengan ketelitian tinggi. Tidak pernah melempar error; hasilnya berupa status. */
export function currentLocation(timeoutMs = 15_000): Promise<LocationState> {
  if (!('geolocation' in navigator)) return Promise.resolve({ kind: 'unavailable' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ kind: 'ok', at: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => resolve({ kind: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
