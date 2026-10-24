// Absensi karyawan: aturan jam masuk dipakai sama persis oleh tablet (umpan balik langsung, bisa offline) dan server.
import { formatTime } from './format';
import type { AttendanceSettings, GeoPoint } from './types';

/** "09:05" -> 545. Jam yang tidak valid dianggap 00:00. */
export function clockToMinutes(clock: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return 0;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

/** Menit sejak tengah malam pada zona waktu toko. */
export function minutesOfDay(iso: string, timeZone: string): number {
  return clockToMinutes(formatTime(iso, timeZone));
}

/** Berapa menit terlambat dari jam masuk + toleransi. 0 berarti tepat waktu. */
export function lateMinutes(clockedAt: string, timeZone: string, cfg: Pick<AttendanceSettings, 'startTime' | 'graceMinutes'>): number {
  return Math.max(0, minutesOfDay(clockedAt, timeZone) - clockToMinutes(cfg.startTime) - Math.max(0, cfg.graceMinutes));
}

/** "Tepat waktu" atau "Telat 12 menit" / "Telat 1 jam 5 menit". */
export function lateLabel(minutes: number): string {
  if (minutes <= 0) return 'Tepat waktu';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Telat ${h ? `${h} jam${m ? ` ${m} menit` : ''}` : `${m} menit`}`;
}

/** Jarak dua titik di permukaan bumi (haversine), dalam meter. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Ketelitian GPS yang diperhitungkan paling banyak segini, supaya lokasi yang sangat kabur tidak ikut lolos. */
export const MAX_ACCURACY_CREDIT_M = 100;

/**
 * Apakah titik absen berada di toko. Ketelitian GPS (dibatasi) ikut diperhitungkan, karena di dalam ruangan
 * GPS HP bisa meleset puluhan meter. Tanpa titik toko di pengaturan, lokasi tidak diperiksa.
 */
export function checkLocation(cfg: Pick<AttendanceSettings, 'storeLat' | 'storeLng' | 'radiusM'>, at: GeoPoint | null): { required: boolean; inside: boolean; distanceM: number | null } {
  if (cfg.storeLat === null || cfg.storeLng === null) return { required: false, inside: true, distanceM: null };
  if (!at) return { required: true, inside: false, distanceM: null };
  const distanceM = distanceMeters({ lat: cfg.storeLat, lng: cfg.storeLng }, at);
  return { required: true, inside: distanceM - Math.min(Math.max(0, at.accuracy), MAX_ACCURACY_CREDIT_M) <= cfg.radiusM, distanceM };
}
