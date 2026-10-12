import { describe, expect, it } from 'vitest';
import { buildReview, type CashierEvent, type ReviewSource } from './review';

const ev = (p: Partial<CashierEvent> & { type: CashierEvent['type'] }): CashierEvent & { userName: string } => ({ id: Math.random().toString(36).slice(2), at: '2026-10-12T03:00:00.000Z', orderRef: 'o1', label: 'Meja 3', amount: 58000, itemCount: 2, billPrints: 0, reason: '', detail: '', userName: 'Rina', ...p });
const empty = (): ReviewSource => ({ events: [], voids: [], discounts: [], freeItems: [], drawers: [], shifts: [], reviewed: new Set() });

describe('daftar perlu ditinjau', () => {
  it('pesanan dihapus setelah tagihan dicetak = risiko tinggi; tanpa tagihan = rendah', () => {
    const r = buildReview({ ...empty(), events: [ev({ id: 'a', type: 'order_deleted', billPrints: 1 }), ev({ id: 'b', type: 'order_deleted', orderRef: 'o2' })] });
    expect(r.map((i) => [i.key, i.severity])).toEqual([['event:a', 'high'], ['event:b', 'low']]);
    expect(r[0].title).toContain('setelah tagihan dicetak');
    expect(r[0].detail).toContain('Tanpa alasan');
  });

  it('tagihan yang sama dicetak 2x ditandai sekali; cetak sekali tidak ditandai', () => {
    const r = buildReview({ ...empty(), events: [ev({ type: 'bill_printed', at: '2026-10-12T03:00:00.000Z' }), ev({ type: 'bill_printed', at: '2026-10-12T03:05:00.000Z' }), ev({ type: 'bill_printed', orderRef: 'o9' })] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: 'bill:o1', kind: 'bill_reprint', title: 'Tagihan dicetak 2 kali', at: '2026-10-12T03:05:00.000Z' });
  });

  it('void tunai tanpa PIN owner tinggi; diskon di bawah ambang diabaikan; selisih kas kecil diabaikan', () => {
    const r = buildReview({
      ...empty(),
      voids: [{ id: 'v1', number: 'A1', cashierName: 'Rina', voidedByName: 'Rina', reason: 'salah input', total: 50000, method: 'cash', voidedAt: '2026-10-12T04:00:00.000Z', approved: false }, { id: 'v2', number: 'A2', cashierName: 'Rina', voidedByName: 'Owner', reason: 'x', total: 20000, method: 'qris', voidedAt: '2026-10-12T04:10:00.000Z', approved: true }],
      discounts: [{ id: 'd1', number: 'A3', cashierName: 'Dimas', at: '2026-10-12T05:00:00.000Z', subtotal: 100000, discountAmount: 50000, reason: 'teman' }, { id: 'd2', number: 'A4', cashierName: 'Dimas', at: '2026-10-12T05:00:00.000Z', subtotal: 100000, discountAmount: 10000, reason: 'member' }],
      shifts: [{ id: 's1', closedAt: '2026-10-12T15:00:00.000Z', closedByName: 'Rina', expectedCash: 500000, countedCash: 450000 }, { id: 's2', closedAt: '2026-10-12T15:00:00.000Z', closedByName: 'Dimas', expectedCash: 500000, countedCash: 499000 }],
    });
    const by = Object.fromEntries(r.map((i) => [i.key, i.severity]));
    expect(by).toEqual({ 'void:v1': 'high', 'void:v2': 'medium', 'discount:d1': 'high', 'shift:s1': 'high' });
    expect(r.find((i) => i.key === 'shift:s1')!.title).toBe('Kas kurang Rp 50.000');
  });

  it('yang sudah ditinjau turun ke bawah', () => {
    const r = buildReview({ ...empty(), events: [ev({ id: 'a', type: 'order_deleted', billPrints: 2 })], drawers: [{ id: 'k', at: '2026-10-12T06:00:00.000Z', userName: 'Rina' }], reviewed: new Set(['event:a']) });
    expect(r.map((i) => [i.key, i.reviewed])).toEqual([['drawer:k', false], ['event:a', true]]);
  });

  it('settlement EDC: kurang dari sistem = tinggi, tidak diisi padahal ada transaksi = sedang, cocok = tidak ditandai', () => {
    const shift = (id: string, nonCash: { qris: number; card: number }, settlement: { qris: number | null; card: number | null } | null) => ({ id, closedAt: '2026-10-12T15:00:00.000Z', closedByName: 'Rina', expectedCash: 100000, countedCash: 100000, nonCash, settlement });
    const r = buildReview({ ...empty(), shifts: [shift('a', { qris: 132300, card: 50000 }, { qris: 100000, card: 50000 }), shift('b', { qris: 80000, card: 0 }, null), shift('c', { qris: 80000, card: 20000 }, { qris: 80000, card: 22000 }), shift('d', { qris: 0, card: 0 }, null)] });
    expect(r.map((i) => [i.key, i.severity, i.title])).toEqual([
      ['settle:a:qris', 'high', 'Settlement QRIS kurang Rp 32.300'],
      ['settle:b:qris', 'medium', 'Settlement QRIS tidak diisi'],
    ]);
  });
});
