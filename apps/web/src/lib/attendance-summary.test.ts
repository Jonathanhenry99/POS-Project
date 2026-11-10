import { describe, expect, it } from 'vitest';
import { summarizeAttendance } from './attendance-summary';

const dates = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];

describe('summarizeAttendance', () => {
  it('hadir = tepat + telat; hari libur di jadwal tidak dihitung tidak hadir', () => {
    const [daffa] = summarizeAttendance({
      dates,
      today: '2026-11-07',
      staff: [{ id: 'daffa' }],
      rows: [
        { userId: 'daffa', date: '2026-11-04', lateMinutes: 0 },
        { userId: 'daffa', date: '2026-11-05', lateMinutes: 21 },
        { userId: 'daffa', date: '2026-11-07', lateMinutes: 0 },
      ],
      schedule: [
        { userId: 'daffa', date: '2026-11-04', status: 'masuk' },
        { userId: 'daffa', date: '2026-11-05', status: 'masuk' },
        { userId: 'other', date: '2026-11-06', status: 'masuk' },
        { userId: 'daffa', date: '2026-11-07', status: 'masuk' },
      ],
    });
    expect(daffa.days.map((d) => d.state)).toEqual(['tepat', 'telat', 'libur', 'tepat']);
    expect(daffa).toMatchObject({ workDays: 3, present: 3, onTime: 2, late: 1, lateTotal: 21, absent: 0, excused: 0 });
  });

  it('dijadwalkan tapi tidak absen = tidak hadir (hari ini masih "belum"); izin dicatat terpisah', () => {
    const [bila] = summarizeAttendance({
      dates,
      today: '2026-11-07',
      staff: [{ id: 'bila' }],
      rows: [],
      schedule: [
        { userId: 'bila', date: '2026-11-04', status: 'masuk' },
        { userId: 'bila', date: '2026-11-05', status: 'izin' },
        { userId: 'bila', date: '2026-11-07', status: 'masuk' },
      ],
    });
    expect(bila.days.map((d) => d.state)).toEqual(['tidak-hadir', 'izin', 'kosong', 'belum']);
    expect(bila).toMatchObject({ workDays: 1, present: 0, absent: 1, excused: 1 });
  });

  it('hari tanpa jadwal sama sekali: hari yang ada absennya wajib untuk semua (aturan lama)', () => {
    const [a, b] = summarizeAttendance({
      dates,
      today: '2026-11-07',
      staff: [{ id: 'a' }, { id: 'b' }],
      rows: [{ userId: 'a', date: '2026-11-05', lateMinutes: 0 }],
      schedule: [],
    });
    expect(a.days.map((d) => d.state)).toEqual(['kosong', 'tepat', 'kosong', 'kosong']);
    expect(b.days.map((d) => d.state)).toEqual(['kosong', 'tidak-hadir', 'kosong', 'kosong']);
    expect(b).toMatchObject({ workDays: 1, absent: 1 });
  });

  it('dua jadwal sehari, satu ditandai sakit: tanpa absen dihitung sakit, bukan tidak hadir', () => {
    const [daffa] = summarizeAttendance({
      dates: ['2026-11-02', '2026-11-03'],
      today: '2026-11-07',
      staff: [{ id: 'daffa' }],
      rows: [],
      schedule: [
        { userId: 'daffa', date: '2026-11-02', status: 'sakit' },
        { userId: 'daffa', date: '2026-11-03', status: 'masuk' },
        { userId: 'daffa', date: '2026-11-03', status: 'sakit' },
      ],
    });
    expect(daffa.days.map((d) => d.state)).toEqual(['sakit', 'sakit']);
    expect(daffa).toMatchObject({ workDays: 0, absent: 0, sick: 2, excused: 2 });
  });
});
