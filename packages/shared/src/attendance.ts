// Absensi karyawan: aturan jam masuk dipakai sama persis oleh tablet (umpan balik langsung, bisa offline) dan server.
import { formatTime } from './format';
import type { AttendanceSettings } from './types';

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
