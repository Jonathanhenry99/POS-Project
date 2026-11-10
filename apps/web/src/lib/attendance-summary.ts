// Rekap absensi per karyawan untuk back office: status tiap hari (tepat, telat, tidak hadir, izin, libur, ...) dan
// jumlahnya. Hari kerja ditentukan dari jadwal; hari yang belum dijadwalkan sama sekali memakai aturan lama (hari yang
// ada absennya = toko buka, semua karyawan wajib absen). Fungsi murni supaya mudah dites.

export type DayState = 'tepat' | 'telat' | 'tidak-hadir' | 'belum' | 'izin' | 'sakit' | 'alpa' | 'libur' | 'kosong';

export interface SummaryInput {
  /** Tanggal-tanggal pada rentang (YYYY-MM-DD, urut naik). */
  dates: string[];
  today: string;
  staff: { id: string }[];
  rows: { userId: string; date: string; lateMinutes: number }[];
  schedule: { userId: string; date: string; status: 'masuk' | 'izin' | 'sakit' | 'alpa' }[];
}

export interface PersonSummary {
  userId: string;
  days: { date: string; state: DayState; lateMinutes: number }[];
  /** Hari wajib masuk sampai hari ini (dijadwalkan masuk, atau hari tanpa jadwal yang ada absennya). */
  workDays: number;
  /** Hadir = tepat waktu + telat. */
  present: number;
  onTime: number;
  late: number;
  lateTotal: number;
  /** Wajib masuk, hari sudah lewat, tetapi tidak ada absen. */
  absent: number;
  /** Izin/sakit/tidak masuk yang tercatat di jadwal. */
  excused: number;
}

export function summarizeAttendance(input: SummaryInput): PersonSummary[] {
  const att = new Map(input.rows.map((r) => [`${r.date}|${r.userId}`, r]));
  const scheduled = new Set(input.schedule.filter((e) => e.status === 'masuk').map((e) => e.date));
  const openDays = new Set(input.rows.map((r) => r.date));
  // Satu orang bisa punya beberapa baris jadwal sehari; "masuk" menang atas izin/sakit.
  const entry = new Map<string, SummaryInput['schedule'][number]['status']>();
  for (const e of input.schedule) {
    const k = `${e.date}|${e.userId}`;
    if (e.status === 'masuk' || !entry.has(k)) entry.set(k, e.status);
  }

  return input.staff.map((u) => {
    const days = input.dates.map((date) => {
      const a = att.get(`${date}|${u.id}`);
      if (a) return { date, state: (a.lateMinutes > 0 ? 'telat' : 'tepat') as DayState, lateMinutes: a.lateMinutes };
      const st = entry.get(`${date}|${u.id}`);
      let state: DayState;
      if (scheduled.has(date) || st) {
        if (st === 'masuk') state = date < input.today ? 'tidak-hadir' : 'belum';
        else if (st) state = st;
        else state = 'libur';
      } else {
        // Hari tanpa jadwal: wajib absen bila toko buka (ada yang absen), seperti sebelum fitur jadwal ada.
        state = openDays.has(date) && date < input.today ? 'tidak-hadir' : openDays.has(date) ? 'belum' : 'kosong';
      }
      return { date, state, lateMinutes: 0 };
    });
    const count = (...s: DayState[]) => days.filter((d) => s.includes(d.state)).length;
    const lateDays = days.filter((d) => d.state === 'telat');
    return {
      userId: u.id,
      days,
      workDays: count('tepat', 'telat', 'tidak-hadir'),
      present: count('tepat', 'telat'),
      onTime: count('tepat'),
      late: lateDays.length,
      lateTotal: lateDays.reduce((n, d) => n + d.lateMinutes, 0),
      absent: count('tidak-hadir'),
      excused: count('izin', 'sakit', 'alpa'),
    };
  });
}
