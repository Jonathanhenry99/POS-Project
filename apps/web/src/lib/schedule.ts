// Jadwal shift mingguan: dibaca karyawan (HP & tablet) dan diatur owner.
import { useCallback, useEffect, useState } from 'react';
import { addDaysIso, businessDate, weekStartOf, type ScheduleEntry, type ShiftTemplate } from '@mourden/shared';
import { api, errorMessage } from './api';

export interface WeekData {
  today: string;
  templates: ShiftTemplate[];
  entries: ScheduleEntry[];
  me: string | null;
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}

export function thisWeek(today: string): string {
  return weekStartOf(today);
}

/** "Senin, 9 Nov" */
export function dayLabel(date: string, style: 'long' | 'short' = 'long'): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: style, day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function weekLabel(weekStart: string): string {
  const end = addDaysIso(weekStart, 6);
  const f = (d: string, withMonth: boolean) => new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', ...(withMonth ? { month: 'short' } : {}), timeZone: 'UTC' });
  return `${f(weekStart, weekStart.slice(5, 7) !== end.slice(5, 7))} – ${f(end, true)} ${end.slice(0, 4)}`;
}

/** Memuat jadwal satu minggu. `asDevice` untuk tablet kasir (layar login, tanpa operator). */
export function useWeek(weekStart: string, opts: { asDevice?: boolean } = {}) {
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!weekStart) return;
    let live = true;
    setLoading(true);
    setError('');
    api<WeekData>(`/schedule?from=${weekStart}&to=${addDaysIso(weekStart, 6)}`, { asDevice: opts.asDevice, operatorId: opts.asDevice ? '' : undefined })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [weekStart, n, opts.asDevice]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, loading, reload };
}

/** Minggu berjalan menurut zona waktu toko (bawaan WIB bila pengaturan belum termuat). */
export function currentWeekStart(timeZone = 'Asia/Jakarta'): string {
  return weekStartOf(businessDate(new Date().toISOString(), timeZone));
}

/** Jam shift "09:00–16:00". */
export function hours(t: Pick<ShiftTemplate, 'startTime' | 'endTime'>): string {
  return `${t.startTime}–${t.endTime}`;
}

/** Warna per shift (urut), dipakai konsisten di semua tampilan jadwal. */
const TONES = [
  { bg: '#ecf9d4', fg: '#2c4a0a', dot: '#7fbf2a' },
  { bg: '#ece8fc', fg: '#3b2a86', dot: '#7c5ce0' },
  { bg: '#fdebdc', fg: '#7a3307', dot: '#e8650f' },
  { bg: '#dff3ee', fg: '#0b5444', dot: '#0e8f6a' },
  { bg: '#fde7ef', fg: '#7d1840', dot: '#d23a73' },
];
export function shiftTone(index: number) {
  return TONES[index % TONES.length];
}
