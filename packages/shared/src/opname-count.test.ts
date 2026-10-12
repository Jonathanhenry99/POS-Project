import { describe, expect, it } from 'vitest';
import { countFromBreakdown, usesPackaging } from './opname-count';

describe('hitung opname dengan kemasan', () => {
  const susu = { packSize: 946, containerWeight: 30 };

  it('10 karton segel + 1 karton terbuka ditimbang 280 (karton 30) = 9.710', () => {
    expect(countFromBreakdown({ sealed: 10, gross: 280, containers: 1 }, susu)).toMatchObject({ qty: 9710, sealedQty: 9460, openQty: 250, tare: 30, error: '' });
  });

  it('dua wadah ditimbang bersama: berat wadah dipotong dua kali', () => {
    expect(countFromBreakdown({ sealed: 0, gross: 1260, containers: 2 }, susu)).toMatchObject({ qty: 1200, tare: 60 });
  });

  it('hanya segel, atau hanya terbuka; jumlah wadah otomatis 1 bila ada berat', () => {
    expect(countFromBreakdown({ sealed: 3, gross: 0, containers: 0 }, susu).qty).toBe(2838);
    expect(countFromBreakdown({ sealed: 0, gross: 530, containers: 0 }, susu)).toMatchObject({ qty: 500, tare: 30 });
    expect(countFromBreakdown({ sealed: 0, gross: 0, containers: 0 }, susu)).toMatchObject({ qty: 0, tare: 0, error: '' });
  });

  it('beans dengan toples saja (tanpa kemasan segel)', () => {
    const beans = { packSize: 0, containerWeight: 350 };
    expect(countFromBreakdown({ sealed: 0, gross: 1190.5, containers: 1 }, beans).qty).toBe(840.5);
    expect(countFromBreakdown({ sealed: 2, gross: 0, containers: 0 }, beans).error).toContain('Isi per kemasan');
  });

  it('menolak berat timbangan di bawah berat wadah dan segel pecahan', () => {
    expect(countFromBreakdown({ sealed: 0, gross: 20, containers: 1 }, susu).error).toContain('lebih kecil');
    expect(countFromBreakdown({ sealed: 1.5, gross: 0, containers: 0 }, susu).error).toContain('bilangan bulat');
  });

  it('bahan tanpa pengaturan kemasan tidak memakai mode ini', () => {
    expect(usesPackaging({ packSize: 0, containerWeight: 0 })).toBe(false);
    expect(usesPackaging(susu)).toBe(true);
  });
});
