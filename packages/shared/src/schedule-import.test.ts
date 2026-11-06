import { expect, it } from 'vitest';
import { importDates, matchName, parseScheduleText, parseWeekStart } from './schedule-import';

const templates = [
  { id: 's1', name: 'Shift 1', startTime: '09:00', endTime: '16:00' },
  { id: 's2', name: 'Shift 2', startTime: '15:00', endTime: '22:00' },
  { id: 'k', name: 'Kitchen', startTime: '14:00', endTime: '21:00' },
];

// Teks persis seperti yang dikirim owner (termasuk spasi & penulisan yang tidak seragam).
const TEXT = `JADWAL SHIFT BARISTA
2 November  - 8 November 2026


Senin
- Shift 1 (9:00-16:00) | ntu
- Shift 2 (15:00-22:00)| dapa
-  kitchen  ila

Selasa 
- Shift 1 (09:00-16:00) | silmi 
- Shift 2 (15:00-22:00)|  deung 
- kitchen bila

Rabu 
- Shift 1 (9:00-16:00) | ntu
- Shift 2 (15:00-22:00) | Silmi
- kitchen (14:00-20:30) ila


Kamis 
- Shift 1 (9:00-16:00) | ntu
- Shift 2 (15:00-22:00) |Silmi
- kitchen (15:00-20:30) ila

Jumat 
- Shift 1 (9:00-16:00) | jon
- Shift 2 (15:00-22:00)| ntu
- Kitchen (14:00-20:30) | bila

Sabtu 
- Shift 1 (9:00-16:00) | dapa
- Shift 2 (15:00-22:00)| ntu
- Kitchen (09:00-20:30) | bila

Minggu 
- Shift 1 (9:00-16:00) | daffa
- Shift 2 (15:00-22:00)| ntu
- Kitchen (14:00-20:30) | ila`;

it('membaca jadwal WhatsApp owner: 7 hari x 3 shift, nama, dan jam khusus kitchen', () => {
  const p = parseScheduleText(TEXT, templates);
  expect(p.weekStart).toBe('2026-11-02');
  expect(p.skipped).toEqual([]);
  expect(p.rows).toHaveLength(21);
  const view = p.rows.map((r) => [r.day, r.templateName, r.names.join('+'), r.startTime ?? '', r.endTime ?? '']);
  expect(view).toEqual([
    [0, 'Shift 1', 'ntu', '', ''], [0, 'Shift 2', 'dapa', '', ''], [0, 'Kitchen', 'ila', '', ''],
    [1, 'Shift 1', 'silmi', '', ''], [1, 'Shift 2', 'deung', '', ''], [1, 'Kitchen', 'bila', '', ''],
    [2, 'Shift 1', 'ntu', '', ''], [2, 'Shift 2', 'Silmi', '', ''], [2, 'Kitchen', 'ila', '', '20:30'],
    [3, 'Shift 1', 'ntu', '', ''], [3, 'Shift 2', 'Silmi', '', ''], [3, 'Kitchen', 'ila', '15:00', '20:30'],
    [4, 'Shift 1', 'jon', '', ''], [4, 'Shift 2', 'ntu', '', ''], [4, 'Kitchen', 'bila', '', '20:30'],
    [5, 'Shift 1', 'dapa', '', ''], [5, 'Shift 2', 'ntu', '', ''], [5, 'Kitchen', 'bila', '09:00', '20:30'],
    [6, 'Shift 1', 'daffa', '', ''], [6, 'Shift 2', 'ntu', '', ''], [6, 'Kitchen', 'ila', '', '20:30'],
  ]);
});

it('beberapa nama dalam satu shift, baris tak dikenal dicatat', () => {
  const p = parseScheduleText('Senin\n- Shift 1 | ntu, dapa & ila\n- Lembur | ntu\nSelasa\n- Kitchen 13:00-21:00 bila', templates);
  expect(p.rows[0].names).toEqual(['ntu', 'dapa', 'ila']);
  expect(p.rows[1]).toMatchObject({ day: 1, templateName: 'Kitchen', startTime: '13:00', endTime: null, names: ['bila'] });
  expect(p.skipped).toEqual(['- Lembur | ntu']);
  expect(p.weekStart).toBeNull();
});

it('tanggal minggu & pengulangan sampai akhir bulan', () => {
  expect(parseWeekStart('30 November - 6 Desember 2026')).toBe('2026-11-30');
  expect(parseWeekStart('28 Des - 3 Jan 2027')).toBe('2026-12-28');
  // Senin 2 Nov diulang: 2, 9, 16, 23, 30 Nov. Minggu 8 Nov: 8, 15, 22, 29.
  expect(importDates('2026-11-02', 0, true)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  expect(importDates('2026-11-02', 6, true)).toEqual(['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  expect(importDates('2026-11-02', 6, false)).toEqual(['2026-11-08']);
  // Hari yang sudah lewat bisa dilewati.
  expect(importDates('2026-11-02', 0, true, '2026-11-06')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
});

it('mencocokkan nama panggilan: alias tersimpan, nama depan, awalan unik', () => {
  const users = [
    { id: 'u1', name: 'Daffa Pratama', username: 'daffa' },
    { id: 'u2', name: 'Restu', username: 'restu' },
    { id: 'u3', name: 'Ila', username: 'ila' },
    { id: 'u4', name: 'Bila', username: 'bila' },
  ];
  expect(matchName('daffa', users, {})).toBe('u1');
  expect(matchName('Ila', users, {})).toBe('u3');
  expect(matchName('bila', users, {})).toBe('u4');
  expect(matchName('dapa', users, {})).toBeNull();
  expect(matchName('dapa', users, { dapa: 'u1' })).toBe('u1');
  expect(matchName('res', users, {})).toBe('u2');
  expect(matchName('ntu', users, { ntu: 'hilang' })).toBeNull();
});
