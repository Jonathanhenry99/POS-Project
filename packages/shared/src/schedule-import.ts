// Membaca jadwal shift dari teks bebas (format yang biasa dikirim lewat WhatsApp), mis.:
//   JADWAL SHIFT BARISTA
//   2 November - 8 November 2026
//   Senin
//   - Shift 1 (9:00-16:00) | ntu
//   -  kitchen  ila
// Fungsi murni: tidak tahu soal pengguna; nama dicocokkan terpisah (lihat matchName).

import { addDaysIso, weekStartOf } from './payroll';

const DAYS: Record<string, number> = { senin: 0, selasa: 1, rabu: 2, kamis: 3, jumat: 4, "jum'at": 4, sabtu: 5, minggu: 6, ahad: 6 };
const MONTHS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12,
};

export interface ImportTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}
export interface ImportRow {
  /** 0 = Senin ... 6 = Minggu */
  day: number;
  templateId: string;
  templateName: string;
  /** Jam khusus bila berbeda dari jam shift bawaan; null = ikut shift. */
  startTime: string | null;
  endTime: string | null;
  names: string[];
  line: string;
}
export interface ParsedSchedule {
  /** Senin minggu yang disebut di teks, bila ada tanggal. */
  weekStart: string | null;
  rows: ImportRow[];
  /** Baris yang tidak dipahami (selain judul), untuk ditunjukkan ke owner. */
  skipped: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (h: string, m: string) => `${pad(Math.min(23, Number(h)))}:${pad(Math.min(59, Number(m)))}`;

/** "2 November - 8 November 2026" / "2-8 Nov 2026" -> Senin minggu itu. */
export function parseWeekStart(text: string): string | null {
  const m = /(\d{1,2})\s*([a-z']+)?\s*[-–]\s*(\d{1,2})\s+([a-z']+)\s+(\d{4})/i.exec(text);
  if (!m) return null;
  const endMonth = MONTHS[m[4].toLowerCase()];
  const startMonth = m[2] ? MONTHS[m[2].toLowerCase()] : endMonth;
  if (!endMonth || !startMonth) return null;
  const year = Number(m[5]) - (startMonth > endMonth ? 1 : 0);
  return weekStartOf(`${year}-${pad(startMonth)}-${pad(Number(m[1]))}`);
}

function dayOf(line: string): number | null {
  const word = line.trim().toLowerCase().replace(/[:,.\s]+$/, '');
  return word in DAYS ? DAYS[word] : null;
}

export function parseScheduleText(text: string, templates: ImportTemplate[]): ParsedSchedule {
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  // Nama shift terpanjang dicoba lebih dulu ("Shift 10" sebelum "Shift 1").
  const byName = [...templates].sort((a, b) => b.name.length - a.name.length);
  let day: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const d = dayOf(line);
    if (d !== null) {
      day = d;
      continue;
    }
    const lower = line.toLowerCase();
    const tpl = byName.find((t) => new RegExp(`(^|[^a-z0-9])${t.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9])`).test(lower));
    if (day === null || !tpl) {
      // Judul & baris tanggal minggu bukan kesalahan; selain itu tunjukkan ke owner.
      if (!parseWeekStart(line) && (day !== null || /\d|\|/.test(line))) skipped.push(line);
      continue;
    }
    const time = /(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/.exec(line);
    const start = time ? clock(time[1], time[2]) : null;
    const end = time ? clock(time[3], time[4]) : null;
    const who = line.includes('|')
      ? line.slice(line.lastIndexOf('|') + 1)
      : line
          .replace(/^[-•*\s]+/, '')
          .replace(new RegExp(tpl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
          .replace(/\([^)]*\)/g, ' ')
          .replace(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/g, ' ');
    const names = who
      .split(/,|&|\/|\bdan\b/i)
      .map((n) => n.replace(/[-•*:|()]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    rows.push({
      day,
      templateId: tpl.id,
      templateName: tpl.name,
      startTime: start && start !== tpl.startTime ? start : null,
      endTime: end && end !== tpl.endTime ? end : null,
      names,
      line,
    });
  }
  return { weekStart: parseWeekStart(text), rows, skipped };
}

/** Tanggal-tanggal penerapan: minggu yang disebut, lalu (bila diminta) diulang tiap minggu sampai akhir bulannya. */
export function importDates(weekStart: string, day: number, repeatToMonthEnd: boolean, fromDate = ''): string[] {
  const first = addDaysIso(weekStart, day);
  const month = weekStart.slice(0, 7) === addDaysIso(weekStart, 6).slice(0, 7) ? weekStart.slice(0, 7) : addDaysIso(weekStart, 6).slice(0, 7);
  const out: string[] = [];
  for (let d = first; ; d = addDaysIso(d, 7)) {
    if (d.slice(0, 7) > month) break;
    if (d >= fromDate) out.push(d);
    if (!repeatToMonthEnd) break;
  }
  return out;
}

/** Cocokkan nama panggilan ke pengguna: alias tersimpan, lalu nama/username persis, lalu awalan yang unik. */
export function matchName(name: string, users: { id: string; name: string; username: string }[], aliases: Record<string, string>): string | null {
  const key = name.trim().toLowerCase();
  if (aliases[key] && users.some((u) => u.id === aliases[key])) return aliases[key];
  const exact = users.filter((u) => u.name.toLowerCase() === key || u.username.toLowerCase() === key || u.name.toLowerCase().split(/\s+/)[0] === key);
  if (exact.length === 1) return exact[0].id;
  const prefix = users.filter((u) => u.name.toLowerCase().startsWith(key) || u.username.toLowerCase().startsWith(key));
  return prefix.length === 1 && key.length >= 3 ? prefix[0].id : null;
}
