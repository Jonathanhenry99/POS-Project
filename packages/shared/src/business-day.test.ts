import { describe, expect, it } from 'vitest';
import { computeBusinessDaySummary } from './business-day';
import { computeShiftSummary } from './pricing';
import { businessDayReceipt, DEFAULT_LAYOUT } from './receipt/receipts';
import { CMD, toEscPos, toPlainText } from './receipt/escpos';
import { DEFAULT_SETTINGS } from './defaults';
import type { BusinessDay, Order, Shift } from './types';

const shift = (id: string, at: string, openingCash: number): Shift => ({
  id, deviceId: 'd', openedById: 'u', openedByName: 'Kasir', openedAt: at, openingCash, cashMovements: [],
  closedById: 'u', closedByName: 'Kasir', closedAt: at, countedCash: openingCash, closingNote: '', summary: null,
});
const order = (shiftId: string, total: number, method: 'cash' | 'qris', status: 'paid' | 'void' = 'paid') => ({
  shiftId, total, subtotal: total, discountAmount: 0, serviceAmount: 0, taxAmount: 0, status, payment: { method },
}) as Order;

describe('rekap hari per terminal', () => {
  it('tidak menggandakan modal pergantian shift dan memisahkan QRIS dari kas', () => {
    const a = shift('a', '2026-10-06T08:00:00.000Z', 100000);
    const b = shift('b', '2026-10-06T09:00:00.000Z', 150000);
    a.summary = computeShiftSummary(a, [order('a', 50000, 'cash'), order('a', 20000, 'qris')]);
    a.countedCash = 150000;
    b.cashMovements = [{ id: 'out', type: 'out', amount: 10000, note: 'Es', at: '', userName: 'Kasir' }];
    b.summary = computeShiftSummary(b, [order('b', 30000, 'cash'), order('b', 40000, 'qris'), order('b', 5000, 'cash', 'void')]);
    b.countedCash = 169000;
    const s = computeBusinessDaySummary([b, a]);
    expect(s).toMatchObject({ openingCash: 100000, shiftCount: 2, orderCount: 4, netSales: 140000, byMethod: { cash: 80000, qris: 60000, card: 0 }, lastExpectedCash: 170000, lastCountedCash: 169000, cashDifference: -1000, voidAmount: 5000 });
  });

  it('snapshot shift tertutup tidak berubah karena transaksi lama dikoreksi', () => {
    const a = shift('a', '2026-10-06T08:00:00.000Z', 100000);
    a.summary = computeShiftSummary(a, [order('a', 50000, 'cash')]);
    expect(computeBusinessDaySummary([a], [order('a', 50000, 'cash', 'void')]).netSales).toBe(50000);
  });

  it('shift terbuka dihitung dari transaksi live, bukan snapshot kosong', () => {
    const a = { ...shift('a', '2026-10-06T08:00:00.000Z', 100000), closedAt: null, countedCash: null };
    expect(computeBusinessDaySummary([a], [order('a', 50000, 'cash')])).toMatchObject({ netSales: 50000, lastExpectedCash: 150000, lastCountedCash: null });
  });

  it('rekap hari tetap rapi 32/48 karakter dan tidak membuka drawer saat cetak ulang', () => {
    const a = shift('a', '2026-10-06T08:00:00.000Z', 100000);
    a.summary = computeShiftSummary(a, [order('a', 50000, 'cash')]);
    const day: BusinessDay = { id: 'day', deviceId: 'd', businessDate: '2026-10-06', openedAt: a.openedAt,
      openedById: 'u', openedByName: 'Kasir', closedAt: a.closedAt, closedById: 'u', closedByName: 'Kasir',
      closingNote: 'Catatan sangat panjang '.repeat(8), shiftIds: ['a'], summary: computeBusinessDaySummary([a]) };
    for (const width of [32, 48]) {
      const ops = businessDayReceipt(day, DEFAULT_SETTINGS.store, { ...DEFAULT_LAYOUT, width, openDrawer: true });
      expect(ops.filter((op) => op.kind === 'text').every((op) => op.text.length <= width)).toBe(true);
      const text = toPlainText(ops, width);
      expect(text).toContain('REKAP TUTUP HARI');
      expect(text).toContain('Rp 50.000');
      expect(Buffer.from(toEscPos(ops)).includes(Buffer.from(CMD.drawer))).toBe(false);
    }
  });
});
