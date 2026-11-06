// Gaji tim: jumlah shift masuk x tarif shift (berlaku per tanggal), dikurangi kasbon, ditambah bonus mingguan
// sesuai Mourden Team Bonus Program 2026. Fungsi murni: dipakai server (slip gaji) dan dites tanpa database.

export type ScheduleStatus = 'masuk' | 'izin' | 'sakit' | 'alpa';
export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = { masuk: 'Masuk', izin: 'Izin', sakit: 'Sakit', alpa: 'Tidak masuk' };

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  role: 'barista' | 'kitchen' | 'kasir' | null;
  sort: number;
  active: boolean;
  rates: ShiftRate[];
}
export interface ShiftRate {
  fee: number;
  effectiveFrom: string;
}
export interface ScheduleEntry {
  id: string;
  date: string;
  templateId: string;
  userId: string;
  userName: string;
  status: ScheduleStatus;
  note: string;
  /** Jam khusus orang ini hari itu; null/kosong = ikut jam shift. */
  startTime?: string | null;
  endTime?: string | null;
  /** Lembur: jam tambahan di luar shift, dibayar per jam dengan tarif yang berlaku saat dicatat. */
  overtimeHours?: number;
  overtimeRate?: number;
  overtimeNote?: string;
}
export interface Kasbon {
  id: string;
  userId: string;
  date: string;
  amount: number;
  note: string;
}
export interface BonusTier {
  /** Omset mingguan minimal untuk tingkat ini. */
  min: number;
  bonus: number;
}
export interface PayrollSettings {
  bonusTiers: BonusTier[];
  /** Tarif lembur per jam untuk catatan lembur baru. */
  overtimeRate: number;
}
export const DEFAULT_OVERTIME_RATE = 10_000;
export interface BonusWeekInput {
  weekStart: string;
  /** Omset dari POS (penjualan bersih Senin-Minggu). */
  posOmset: number;
  omsetOverride: number | null;
  disqualified: string[];
}

/** Sesuai PDF: < 6,5 jt tidak ada; 6,5-7 jt 150 rb; 7-7,5 jt 250 rb; 7,5-8 jt 350 rb; >= 8 jt 500 rb. */
export const DEFAULT_BONUS_TIERS: BonusTier[] = [
  { min: 6_500_000, bonus: 150_000 },
  { min: 7_000_000, bonus: 250_000 },
  { min: 7_500_000, bonus: 350_000 },
  { min: 8_000_000, bonus: 500_000 },
];

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Senin pada minggu tanggal ini. */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  return addDaysIso(date, day === 0 ? -6 : 1 - day);
}

/** Minggu (Senin) yang hari Minggu-nya jatuh di bulan ini: bonus minggu itu dibayar bersama gaji bulan ini. */
export function bonusWeeksOfMonth(month: string): string[] {
  const first = `${month}-01`;
  const weeks: string[] = [];
  let start = weekStartOf(first);
  for (;;) {
    const end = addDaysIso(start, 6);
    if (end.slice(0, 7) > month) break;
    if (end.slice(0, 7) === month) weeks.push(start);
    start = addDaysIso(start, 7);
  }
  return weeks;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function teamBonus(omset: number, tiers: BonusTier[]): number {
  return [...tiers].sort((a, b) => b.min - a.min).find((t) => omset >= t.min)?.bonus ?? 0;
}

/** Tarif shift pada tanggal itu: tarif terakhir yang sudah berlaku. */
export function feeOn(template: Pick<ShiftTemplate, 'rates'> | undefined, date: string): number {
  const rate = [...(template?.rates ?? [])].filter((r) => r.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return rate?.fee ?? 0;
}

export interface WeekBonus {
  weekStart: string;
  weekEnd: string;
  omset: number;
  omsetSource: 'pos' | 'manual';
  teamBonus: number;
  totalShifts: number;
  perShift: number;
  /** userId -> { shifts, bonus } */
  people: Record<string, { shifts: number; bonus: number; disqualified: boolean }>;
}

export function computeWeekBonus(week: BonusWeekInput, entries: ScheduleEntry[], tiers: BonusTier[]): WeekBonus {
  const weekEnd = addDaysIso(week.weekStart, 6);
  const counted = entries.filter((e) => e.status === 'masuk' && e.date >= week.weekStart && e.date <= weekEnd);
  const omset = week.omsetOverride ?? week.posOmset;
  const bonus = teamBonus(omset, tiers);
  const perShift = counted.length ? bonus / counted.length : 0;
  const people: WeekBonus['people'] = {};
  for (const e of counted) people[e.userId] = { shifts: (people[e.userId]?.shifts ?? 0) + 1, bonus: 0, disqualified: week.disqualified.includes(e.userId) };
  // Yang tidak memenuhi syarat tidak mendapat bagiannya; bagian orang lain tidak berubah (rumus per shift tetap).
  for (const p of Object.values(people)) p.bonus = p.disqualified ? 0 : Math.round(perShift * p.shifts);
  return { weekStart: week.weekStart, weekEnd, omset, omsetSource: week.omsetOverride === null ? 'pos' : 'manual', teamBonus: bonus, totalShifts: counted.length, perShift: Math.round(perShift), people };
}

export interface PayrollLine {
  date: string;
  templateId: string;
  templateName: string;
  fee: number;
}
export interface PersonPayroll {
  userId: string;
  name: string;
  role: string;
  shifts: PayrollLine[];
  /** Shift terjadwal yang tidak dihitung (izin/sakit/tidak masuk). */
  absences: { date: string; templateName: string; status: ScheduleStatus; note: string }[];
  gross: number;
  overtime: { date: string; templateName: string; hours: number; rate: number; amount: number; note: string }[];
  overtimeTotal: number;
  kasbon: Kasbon[];
  kasbonTotal: number;
  bonuses: { weekStart: string; weekEnd: string; shifts: number; bonus: number; disqualified: boolean }[];
  bonusTotal: number;
  takeHome: number;
}

export function computePayroll(input: {
  month: string;
  users: { id: string; name: string; role: string }[];
  templates: ShiftTemplate[];
  entries: ScheduleEntry[];
  kasbon: Kasbon[];
  weeks: WeekBonus[];
}): PersonPayroll[] {
  const { from, to } = monthRange(input.month);
  const tpl = new Map(input.templates.map((t) => [t.id, t]));
  const inMonth = input.entries.filter((e) => e.date >= from && e.date <= to);
  const ids = new Set([...inMonth.map((e) => e.userId), ...input.kasbon.map((k) => k.userId), ...input.weeks.flatMap((w) => Object.keys(w.people))]);
  return input.users
    .filter((u) => ids.has(u.id))
    .map((u) => {
      const mine = inMonth.filter((e) => e.userId === u.id).sort((a, b) => a.date.localeCompare(b.date) || (tpl.get(a.templateId)?.sort ?? 0) - (tpl.get(b.templateId)?.sort ?? 0));
      const shifts = mine.filter((e) => e.status === 'masuk').map((e) => ({ date: e.date, templateId: e.templateId, templateName: tpl.get(e.templateId)?.name ?? 'Shift', fee: feeOn(tpl.get(e.templateId), e.date) }));
      const absences = mine.filter((e) => e.status !== 'masuk').map((e) => ({ date: e.date, templateName: tpl.get(e.templateId)?.name ?? 'Shift', status: e.status, note: e.note }));
      const kasbon = input.kasbon.filter((k) => k.userId === u.id && k.date >= from && k.date <= to).sort((a, b) => a.date.localeCompare(b.date));
      const bonuses = input.weeks.filter((w) => w.people[u.id]).map((w) => ({ weekStart: w.weekStart, weekEnd: w.weekEnd, ...w.people[u.id] }));
      const gross = shifts.reduce((n, s) => n + s.fee, 0);
      // Lembur hanya untuk shift yang benar-benar masuk.
      const overtime = mine
        .filter((e) => e.status === 'masuk' && (e.overtimeHours ?? 0) > 0)
        .map((e) => ({ date: e.date, templateName: tpl.get(e.templateId)?.name ?? 'Shift', hours: e.overtimeHours!, rate: e.overtimeRate ?? 0, amount: Math.round(e.overtimeHours! * (e.overtimeRate ?? 0)), note: e.overtimeNote ?? '' }));
      const overtimeTotal = overtime.reduce((n, o) => n + o.amount, 0);
      const kasbonTotal = kasbon.reduce((n, k) => n + k.amount, 0);
      const bonusTotal = bonuses.reduce((n, b) => n + b.bonus, 0);
      return { userId: u.id, name: u.name, role: u.role, shifts, absences, gross, overtime, overtimeTotal, kasbon, kasbonTotal, bonuses, bonusTotal, takeHome: gross + overtimeTotal - kasbonTotal + bonusTotal };
    });
}
