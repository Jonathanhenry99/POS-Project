import { expect, it } from 'vitest';
import { checkLocation, clockToMinutes, distanceMeters, lateLabel, lateMinutes, minutesOfDay } from './attendance';

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

it('jarak & pemeriksaan lokasi toko: ketelitian GPS diperhitungkan tetapi dibatasi', () => {
  const store = { lat: -6.2, lng: 106.816666 };
  // 0,001 derajat lintang ~ 111 m.
  expect(distanceMeters(store, { lat: -6.201, lng: 106.816666 })).toBe(111);
  const cfg = { storeLat: store.lat, storeLng: store.lng, radiusM: 150 };
  expect(checkLocation(cfg, { lat: -6.201, lng: 106.816666, accuracy: 10 })).toEqual({ required: true, inside: true, distanceM: 111 });
  // 222 m, ketelitian 80 m -> 142 m <= 150: masih dianggap di toko.
  expect(checkLocation(cfg, { lat: -6.202, lng: 106.816666, accuracy: 80 }).inside).toBe(true);
  // Ketelitian 5 km tidak membuat lokasi 1 km lolos (kredit maksimal 100 m).
  expect(checkLocation(cfg, { lat: -6.209, lng: 106.816666, accuracy: 5000 })).toMatchObject({ inside: false, distanceM: 1001 });
  expect(checkLocation(cfg, null)).toEqual({ required: true, inside: false, distanceM: null });
  expect(checkLocation({ storeLat: null, storeLng: null, radiusM: 150 }, null)).toEqual({ required: false, inside: true, distanceM: null });
});
