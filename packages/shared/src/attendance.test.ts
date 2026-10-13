import { expect, it } from 'vitest';
import { clockToMinutes, lateLabel, lateMinutes, minutesOfDay } from './attendance';

const cfg = { startTime: '09:00', graceMinutes: 0 };

it('jam masuk dihitung pada zona waktu toko, bukan UTC', () => {
  // 01:52 UTC = 08:52 WIB, 02:12 UTC = 09:12 WIB
  expect(minutesOfDay('2026-10-14T01:52:00.000Z', 'Asia/Jakarta')).toBe(8 * 60 + 52);
  expect(lateMinutes('2026-10-14T01:52:00.000Z', 'Asia/Jakarta', cfg)).toBe(0);
  expect(lateMinutes('2026-10-14T02:00:00.000Z', 'Asia/Jakarta', cfg)).toBe(0);
  expect(lateMinutes('2026-10-14T02:12:00.000Z', 'Asia/Jakarta', cfg)).toBe(12);
  // Jam yang sama di WITA sudah 10:12.
  expect(lateMinutes('2026-10-14T02:12:00.000Z', 'Asia/Makassar', cfg)).toBe(72);
});

it('toleransi menggeser batas telat; jam tidak valid dianggap 00:00', () => {
  expect(lateMinutes('2026-10-14T02:12:00.000Z', 'Asia/Jakarta', { startTime: '09:00', graceMinutes: 15 })).toBe(0);
  expect(lateMinutes('2026-10-14T02:20:00.000Z', 'Asia/Jakarta', { startTime: '09:00', graceMinutes: 15 })).toBe(5);
  expect(clockToMinutes('7:05')).toBe(425);
  expect(clockToMinutes('ngawur')).toBe(0);
});

it('label telat mudah dibaca', () => {
  expect(lateLabel(0)).toBe('Tepat waktu');
  expect(lateLabel(12)).toBe('Telat 12 menit');
  expect(lateLabel(60)).toBe('Telat 1 jam');
  expect(lateLabel(65)).toBe('Telat 1 jam 5 menit');
});
