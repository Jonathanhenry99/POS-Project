import { expect, it } from 'vitest';
import { bonusWeeksOfMonth, computePayroll, computeWeekBonus, DEFAULT_BONUS_TIERS, feeOn, teamBonus, weekStartOf, type ScheduleEntry, type ShiftTemplate } from './payroll';

const shift1: ShiftTemplate = { id: 's1', name: 'Shift 1', startTime: '09:00', endTime: '16:00', role: 'barista', sort: 0, active: true, rates: [{ fee: 75000, effectiveFrom: '2026-01-01' }, { fee: 80000, effectiveFrom: '2026-11-16' }] };
const kitchen: ShiftTemplate = { id: 'k', name: 'Kitchen', startTime: '14:00', endTime: '21:00', role: 'kitchen', sort: 2, active: true, rates: [{ fee: 70000, effectiveFrom: '2026-01-01' }] };
let n = 0;
const entry = (userId: string, date: string, templateId = 's1', status: ScheduleEntry['status'] = 'masuk'): ScheduleEntry => ({ id: `e${n++}`, date, templateId, userId, userName: userId, status, note: '' });

it('tingkat bonus sesuai PDF', () => {
  expect(teamBonus(6_499_999, DEFAULT_BONUS_TIERS)).toBe(0);
  expect(teamBonus(6_500_000, DEFAULT_BONUS_TIERS)).toBe(150_000);
  expect(teamBonus(7_250_000, DEFAULT_BONUS_TIERS)).toBe(250_000);
  expect(teamBonus(7_999_999, DEFAULT_BONUS_TIERS)).toBe(350_000);
  expect(teamBonus(12_000_000, DEFAULT_BONUS_TIERS)).toBe(500_000);
});

it('contoh PDF: bonus 250 rb, 20 shift -> 12.500/shift; Daffa 6, Restu 5, Bila 4, Ila 5', () => {
  const week = '2026-11-02'; // Senin
  const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${2 + i}`);
  const entries = [
    ...days.slice(0, 6).map((d) => entry('daffa', d)),
    ...days.slice(0, 5).map((d) => entry('restu', d)),
    ...days.slice(0, 4).map((d) => entry('bila', d, 'k')),
    ...days.slice(0, 5).map((d) => entry('ila', d, 'k')),
    entry('restu', days[6], 's1', 'sakit'),
  ];
  const w = computeWeekBonus({ weekStart: week, posOmset: 7_200_000, omsetOverride: null, disqualified: [] }, entries, DEFAULT_BONUS_TIERS);
  expect(w).toMatchObject({ teamBonus: 250_000, totalShifts: 20, perShift: 12_500, omsetSource: 'pos' });
  expect(Object.fromEntries(Object.entries(w.people).map(([k, v]) => [k, v.bonus]))).toEqual({ daffa: 75_000, restu: 62_500, bila: 50_000, ila: 62_500 });
  // Omset manual & tidak memenuhi syarat: bagian orang lain tidak berubah.
  const w2 = computeWeekBonus({ weekStart: week, posOmset: 7_200_000, omsetOverride: 8_100_000, disqualified: ['bila'] }, entries, DEFAULT_BONUS_TIERS);
  expect(w2.teamBonus).toBe(500_000);
  expect(w2.people.bila).toEqual({ shifts: 4, bonus: 0, disqualified: true });
  expect(w2.people.daffa.bonus).toBe(150_000);
});

it('minggu & tarif: Senin sebagai awal minggu, bonus ikut bulan hari Minggu-nya, tarif berlaku per tanggal', () => {
  expect(weekStartOf('2026-11-08')).toBe('2026-11-02'); // Minggu -> Senin sebelumnya
  expect(weekStartOf('2026-11-02')).toBe('2026-11-02');
  // November 2026: Minggu jatuh pada 1, 8, 15, 22, 29.
  expect(bonusWeeksOfMonth('2026-11')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  expect(feeOn(shift1, '2026-11-15')).toBe(75000);
  expect(feeOn(shift1, '2026-11-16')).toBe(80000);
});

it('gaji bulanan = shift masuk x tarif - kasbon + bonus; izin/sakit tidak dihitung', () => {
  const entries = [entry('daffa', '2026-11-03'), entry('daffa', '2026-11-16'), entry('daffa', '2026-11-17', 's1', 'izin'), entry('bila', '2026-11-03', 'k'), entry('daffa', '2026-10-30')];
  const week = computeWeekBonus({ weekStart: '2026-11-02', posOmset: 7_000_000, omsetOverride: null, disqualified: [] }, entries, DEFAULT_BONUS_TIERS);
  const res = computePayroll({
    month: '2026-11',
    users: [{ id: 'daffa', name: 'Daffa', role: 'barista' }, { id: 'bila', name: 'Bila', role: 'kitchen' }, { id: 'kosong', name: 'Kosong', role: 'barista' }],
    templates: [shift1, kitchen],
    entries,
    kasbon: [{ id: 'k1', userId: 'daffa', date: '2026-11-05', amount: 50000, note: 'bensin' }, { id: 'k2', userId: 'daffa', date: '2026-11-20', amount: 30000, note: '' }, { id: 'k3', userId: 'daffa', date: '2026-10-20', amount: 99999, note: 'bulan lalu' }],
    weeks: [week],
  });
  expect(res.map((p) => p.name)).toEqual(['Daffa', 'Bila']);
  const daffa = res[0];
  expect(daffa.shifts.map((s) => s.fee)).toEqual([75000, 80000]);
  expect(daffa.absences).toEqual([{ date: '2026-11-17', templateName: 'Shift 1', status: 'izin', note: '' }]);
  expect(daffa).toMatchObject({ gross: 155000, kasbonTotal: 80000, bonusTotal: 125000, takeHome: 155000 - 80000 + 125000 });
  expect(res[1]).toMatchObject({ gross: 70000, bonusTotal: 125000 });
});

it('lembur: jam x tarif saat dicatat, masuk gaji; lembur di hari izin tidak dibayar', () => {
  const lembur = { ...entry('restu', '2026-11-04'), overtimeHours: 2, overtimeRate: 10_000, overtimeNote: 'sampai 18:00' };
  const izin = { ...entry('restu', '2026-11-05', 's1', 'izin'), overtimeHours: 1, overtimeRate: 10_000 };
  const setengah = { ...entry('restu', '2026-11-06'), overtimeHours: 1.5, overtimeRate: 12_000 };
  const [restu] = computePayroll({ month: '2026-11', users: [{ id: 'restu', name: 'Restu', role: 'barista' }], templates: [shift1], entries: [lembur, izin, setengah], kasbon: [], weeks: [] });
  expect(restu.overtime).toEqual([
    { date: '2026-11-04', templateName: 'Shift 1', hours: 2, rate: 10_000, amount: 20_000, note: 'sampai 18:00' },
    { date: '2026-11-06', templateName: 'Shift 1', hours: 1.5, rate: 12_000, amount: 18_000, note: '' },
  ]);
  expect(restu).toMatchObject({ gross: 150_000, overtimeTotal: 38_000, takeHome: 188_000 });
});
