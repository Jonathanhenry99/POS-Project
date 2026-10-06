import { describe, expect, it } from 'vitest';
import { cashSuggestions, computeShiftSummary, computeTotals, discountAmountOf, validateOrderMath } from './pricing';
import { hashPin, isValidPin, verifyPin } from './pin';
import type { Order, PricingSettings } from './types';

const base: PricingSettings = {
  serviceEnabled: false,
  servicePct: 5,
  taxEnabled: false,
  taxPct: 10,
  taxLabel: 'PB1',
  roundingMode: 'none',
  roundingUnit: 100,
};

describe('computeTotals', () => {
  it('tanpa pajak dan service', () => {
    expect(computeTotals([{ lineTotal: 25000 }, { lineTotal: 30000 }], null, base)).toEqual({
      subtotal: 55000,
      discountAmount: 0,
      serviceAmount: 0,
      taxAmount: 0,
      roundingAmount: 0,
      total: 55000,
    });
  });

  it('service 5% dihitung dari subtotal setelah diskon, PB1 dari (dasar + service)', () => {
    const t = computeTotals([{ lineTotal: 100000 }], { type: 'amount', value: 10000, reason: '' }, {
      ...base,
      serviceEnabled: true,
      taxEnabled: true,
    });
    expect(t.serviceAmount).toBe(4500);
    expect(t.taxAmount).toBe(9450);
    expect(t.total).toBe(103950);
  });

  it('pembulatan ke bawah dan terdekat', () => {
    const items = [{ lineTotal: 33333 }];
    expect(computeTotals(items, null, { ...base, roundingMode: 'down' }).total).toBe(33300);
    expect(computeTotals(items, null, { ...base, roundingMode: 'down' }).roundingAmount).toBe(-33);
    expect(computeTotals([{ lineTotal: 33350 }], null, { ...base, roundingMode: 'nearest' }).total).toBe(33400);
  });

  it('diskon tidak melebihi subtotal', () => {
    expect(discountAmountOf(20000, { type: 'amount', value: 50000, reason: '' })).toBe(20000);
    expect(discountAmountOf(20000, { type: 'percent', value: 150, reason: '' })).toBe(20000);
  });
});

describe('cashSuggestions', () => {
  it('uang pas lalu pecahan berikutnya', () => {
    expect(cashSuggestions(97335)).toEqual([97335, 98000, 100000]);
    expect(cashSuggestions(25000)).toEqual([25000, 30000, 40000, 50000, 100000]);
    expect(cashSuggestions(103950)).toEqual([103950, 105000, 110000, 120000, 150000, 200000]);
  });
});

describe('validateOrderMath', () => {
  const order = {
    items: [{ id: 'i', productId: 'p', name: 'Latte', basePrice: 30000, unitPrice: 35000, qty: 2, lineTotal: 70000, note: '', options: [{ optionId: 'o', groupName: 'Ukuran', name: 'Large', priceDelta: 5000 }] }],
    discount: null,
    servicePct: 5,
    taxPct: 0,
    taxLabel: 'PB1',
    subtotal: 70000,
    discountAmount: 0,
    serviceAmount: 3500,
    taxAmount: 0,
    roundingAmount: -500,
    total: 73000,
    payment: { method: 'cash', amount: 73000, tendered: 100000, change: 27000, reference: '' },
  } as unknown as Order;

  it('lolos untuk order yang benar (termasuk pembulatan)', () => {
    expect(validateOrderMath(order)).toEqual([]);
  });

  it('menolak total yang dimanipulasi', () => {
    expect(validateOrderMath({ ...order, total: 1000 })).toContain('Total tidak sesuai');
    expect(validateOrderMath({ ...order, items: [{ ...order.items[0], unitPrice: 1000 }] }).length).toBeGreaterThan(0);
  });
});

describe('computeShiftSummary', () => {
  it('menghitung kas seharusnya dan mengabaikan transaksi void', () => {
    const mk = (method: string, total: number, status = 'paid') =>
      ({ status, total, subtotal: total, discountAmount: 0, serviceAmount: 0, taxAmount: 0, payment: { method } }) as unknown as Order;
    const s = computeShiftSummary(
      { openingCash: 100000, cashMovements: [{ id: '1', type: 'out', amount: 20000, note: '', at: '', userName: '' }] },
      [mk('cash', 50000), mk('qris', 30000), mk('cash', 10000, 'void')],
    );
    expect(s.orderCount).toBe(2);
    expect(s.voidCount).toBe(1);
    expect(s.byMethod).toEqual({ cash: 50000, qris: 30000, card: 0 });
    expect(s.expectedCash).toBe(130000);
  });
});

describe('PIN', () => {
  it('hash dan verifikasi', async () => {
    const h = await hashPin('1234');
    expect(h.startsWith('pbkdf2$')).toBe(true);
    expect(h).not.toContain('1234$');
    expect(await verifyPin('1234', h)).toBe(true);
    expect(await verifyPin('4321', h)).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('123456')).toBe(true);
  });
});
