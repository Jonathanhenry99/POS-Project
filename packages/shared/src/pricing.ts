import type {
  Discount,
  Order,
  OrderItem,
  OrderItemOption,
  PaymentMethod,
  PricingSettings,
  Shift,
  ShiftSummary,
  Totals,
} from './types';

/** Harga satuan dan total baris dari harga dasar + opsi. */
export function priceLine(basePrice: number, options: OrderItemOption[], qty: number) {
  const unitPrice = basePrice + options.reduce((s, o) => s + o.priceDelta, 0);
  return { unitPrice, lineTotal: unitPrice * qty };
}

export function discountAmountOf(subtotal: number, discount: Discount | null): number {
  if (!discount || discount.value <= 0) return 0;
  const raw =
    discount.type === 'percent'
      ? Math.round((subtotal * Math.min(discount.value, 100)) / 100)
      : Math.round(discount.value);
  return Math.min(raw, subtotal);
}

function applyRounding(amount: number, mode: PricingSettings['roundingMode'], unit: number): number {
  if (mode === 'none' || unit <= 1) return amount;
  if (mode === 'down') return Math.floor(amount / unit) * unit;
  return Math.round(amount / unit) * unit;
}

/**
 * Urutan hitung:
 *   subtotal - diskon = dasar
 *   service = dasar x service%
 *   pajak   = (dasar + service) x pajak%
 *   total   = dasar + service + pajak, lalu dibulatkan (opsional)
 */
export function computeTotals(
  items: Pick<OrderItem, 'lineTotal'>[],
  discount: Discount | null,
  pricing: PricingSettings,
): Totals {
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmount = discountAmountOf(subtotal, discount);
  const base = subtotal - discountAmount;
  const serviceAmount = pricing.serviceEnabled ? Math.round((base * pricing.servicePct) / 100) : 0;
  const taxAmount = pricing.taxEnabled ? Math.round(((base + serviceAmount) * pricing.taxPct) / 100) : 0;
  const raw = base + serviceAmount + taxAmount;
  const total = applyRounding(raw, pricing.roundingMode, pricing.roundingUnit);
  return { subtotal, discountAmount, serviceAmount, taxAmount, roundingAmount: total - raw, total };
}

/** Pricing yang tersimpan di order (snapshot), dipakai server untuk memverifikasi angka. */
export function pricingFromOrder(order: Pick<Order, 'servicePct' | 'taxPct' | 'taxLabel'>): PricingSettings {
  return {
    serviceEnabled: order.servicePct > 0,
    servicePct: order.servicePct,
    taxEnabled: order.taxPct > 0,
    taxPct: order.taxPct,
    taxLabel: order.taxLabel,
    roundingMode: 'none',
    roundingUnit: 0,
  };
}

/**
 * Memeriksa konsistensi angka di sebuah order (baris, subtotal, diskon, service, pajak, total).
 * Mengembalikan daftar masalah; kosong berarti valid.
 */
export function validateOrderMath(order: Order): string[] {
  const problems: string[] = [];
  for (const item of order.items) {
    const { unitPrice, lineTotal } = priceLine(item.basePrice, item.options, item.qty);
    if (unitPrice !== item.unitPrice || lineTotal !== item.lineTotal) {
      problems.push(`Harga baris "${item.name}" tidak sesuai`);
    }
  }
  const t = computeTotals(order.items, order.discount, pricingFromOrder(order));
  const expectedTotal = t.total + order.roundingAmount;
  if (t.subtotal !== order.subtotal) problems.push('Subtotal tidak sesuai');
  if (t.discountAmount !== order.discountAmount) problems.push('Diskon tidak sesuai');
  if (t.serviceAmount !== order.serviceAmount) problems.push('Service tidak sesuai');
  if (t.taxAmount !== order.taxAmount) problems.push('Pajak tidak sesuai');
  if (expectedTotal !== order.total) problems.push('Total tidak sesuai');
  if (Math.abs(order.roundingAmount) >= 1000) problems.push('Pembulatan tidak wajar');
  if (order.payment.amount !== order.total) problems.push('Jumlah bayar tidak sama dengan total');
  if (order.payment.method === 'cash' && order.payment.tendered - order.payment.change !== order.total) {
    problems.push('Kembalian tidak sesuai');
  }
  return problems;
}

/** Saran nominal uang tunai: uang pas lalu pecahan umum di atas total. */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const notes = [1000, 5000, 10000, 20000, 50000, 100000];
  const set = new Set<number>([total]);
  for (const n of notes) {
    const up = Math.ceil(total / n) * n;
    if (up > total) set.add(up);
  }
  return [...set].sort((a, b) => a - b).slice(0, 5);
}

export function emptySummary(): ShiftSummary {
  return {
    orderCount: 0,
    voidCount: 0,
    voidAmount: 0,
    grossSales: 0,
    discountTotal: 0,
    serviceTotal: 0,
    taxTotal: 0,
    netSales: 0,
    byMethod: { cash: 0, qris: 0, card: 0 },
    cashIn: 0,
    cashOut: 0,
    expectedCash: 0,
  };
}

/** Rekap shift dihitung di tablet (bisa offline) dari transaksi pada shift tersebut. */
export function computeShiftSummary(shift: Pick<Shift, 'openingCash' | 'cashMovements'>, orders: Order[]): ShiftSummary {
  const s = emptySummary();
  for (const o of orders) {
    if (o.status === 'void') {
      s.voidCount++;
      s.voidAmount += o.total;
      continue;
    }
    s.orderCount++;
    s.grossSales += o.subtotal;
    s.discountTotal += o.discountAmount;
    s.serviceTotal += o.serviceAmount;
    s.taxTotal += o.taxAmount;
    s.netSales += o.total;
    s.byMethod[o.payment.method as PaymentMethod] += o.total;
  }
  for (const m of shift.cashMovements) {
    if (m.type === 'in') s.cashIn += m.amount;
    else s.cashOut += m.amount;
  }
  s.expectedCash = shift.openingCash + s.byMethod.cash + s.cashIn - s.cashOut;
  return s;
}
