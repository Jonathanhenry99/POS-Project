import { describe, expect, it } from 'vitest';
import { analyzeVariance, type VarianceInput } from './stock-variance';
import { computeShiftSummary } from './pricing';
import type { Order } from './types';

const row = (p: Partial<VarianceInput> & { name: string }): VarianceInput => ({ ingredientId: p.name, unit: 'pcs', station: 'bar', costPerUnit: 1000, tolerancePct: null, soldQty: 100, compQty: 0, wasteQty: 0, opnameDiff: 0, opnameCount: 1, ...p });

describe('selisih bahan', () => {
  it('dua minuman dibuat tapi satu diinput: cup yang hilang melewati toleransi -> abnormal', () => {
    // 100 cup terpakai menurut penjualan, tetapi fisik berkurang 106 (toleransi cup 0%).
    const r = analyzeVariance([row({ name: 'Cup', tolerancePct: 0, opnameDiff: -6 })], 3).rows[0];
    expect(r).toMatchObject({ status: 'abnormal', unexplainedQty: 6, variancePct: 6, lossValue: 6000, excessValue: 6000 });
  });

  it('komplimen yang dicatat menambah pemakaian, jadi tidak muncul sebagai selisih', () => {
    // Tanpa dicatat: 3 cup hilang. Setelah dicatat sebagai komplimen: sistem sudah memotongnya, opname pas.
    const tanpa = analyzeVariance([row({ name: 'Cup', tolerancePct: 0, opnameDiff: -3 })], 3).rows[0];
    const dicatat = analyzeVariance([row({ name: 'Cup', tolerancePct: 0, compQty: 3, opnameDiff: 0 })], 3).rows[0];
    expect(tanpa.status).toBe('abnormal');
    expect(dicatat).toMatchObject({ status: 'wajar', usageQty: 103, unexplainedQty: 0 });
  });

  it('selisih dalam toleransi wajar; lebih dari sistem ditandai; belum dihitung tidak dinilai', () => {
    const rep = analyzeVariance(
      [
        row({ name: 'Susu', unit: 'ml', soldQty: 10000, opnameDiff: -250, costPerUnit: 22 }), // 2,5% <= 3%
        row({ name: 'Kopi', unit: 'gr', soldQty: 1000, opnameDiff: -80, costPerUnit: 150 }), // 8% > 3%
        row({ name: 'Gula', soldQty: 100, opnameDiff: 20 }),
        row({ name: 'Matcha', soldQty: 50, opnameCount: 0 }),
        row({ name: 'Tisu', soldQty: 0, opnameDiff: -2 }),
      ],
      3,
    );
    const by = Object.fromEntries(rep.rows.map((r) => [r.name, r.status]));
    expect(by).toEqual({ Kopi: 'abnormal', Tisu: 'abnormal', Gula: 'lebih', Matcha: 'belum_opname', Susu: 'wajar' });
    expect(rep.rows[0].name).toBe('Kopi');
    const kopi = rep.rows.find((r) => r.name === 'Kopi')!;
    expect(kopi.excessValue).toBe(Math.round((80 - 30) * 150));
    expect(rep.totals).toMatchObject({ abnormal: 2, notCounted: 1 });
    expect(rep.rows.find((r) => r.name === 'Tisu')!.variancePct).toBeNull();
  });
});

describe('rekap shift', () => {
  it('komplimen tidak dihitung sebagai penjualan maupun diskon', () => {
    const base = { status: 'paid', subtotal: 30000, discountAmount: 0, serviceAmount: 1500, taxAmount: 0, total: 31500, payment: { method: 'cash' } } as unknown as Order;
    const comp = { ...base, discountAmount: 30000, serviceAmount: 0, total: 0, comp: { employeeId: 'u', employeeName: 'Budi', approvedById: null } } as Order;
    const s = computeShiftSummary({ openingCash: 100000, cashMovements: [] }, [base, comp]);
    expect(s).toMatchObject({ orderCount: 1, grossSales: 30000, discountTotal: 0, netSales: 31500, compCount: 1, compValue: 30000, expectedCash: 131500 });
  });
});
