import { computeShiftSummary } from './pricing';
import type { BusinessDaySummary, Order, Shift } from './types';

/** Rekap memakai snapshot shift tertutup; hanya shift terbuka dihitung dari order live. */
export function computeBusinessDaySummary(shifts: Shift[], orders: Order[] = []): BusinessDaySummary {
  const sorted = [...shifts].sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));
  const result: BusinessDaySummary = {
    shiftCount: sorted.length, orderCount: 0, voidCount: 0, voidAmount: 0,
    grossSales: 0, discountTotal: 0, serviceTotal: 0, taxTotal: 0, netSales: 0,
    byMethod: { cash: 0, qris: 0, card: 0 }, cashIn: 0, cashOut: 0,
    openingCash: sorted[0]?.openingCash ?? 0, lastExpectedCash: 0, lastCountedCash: null, cashDifference: 0,
  };
  for (const shift of sorted) {
    const s = shift.closedAt && shift.summary ? shift.summary : computeShiftSummary(shift, orders.filter((o) => o.shiftId === shift.id));
    for (const key of ['orderCount', 'voidCount', 'voidAmount', 'grossSales', 'discountTotal', 'serviceTotal', 'taxTotal', 'netSales', 'cashIn', 'cashOut'] as const) {
      result[key] += s[key];
    }
    for (const method of ['cash', 'qris', 'card'] as const) result.byMethod[method] += s.byMethod[method];
    result.lastExpectedCash = s.expectedCash;
    result.lastCountedCash = shift.countedCash;
    if (shift.closedAt && shift.countedCash !== null) result.cashDifference += shift.countedCash - s.expectedCash;
  }
  return result;
}
