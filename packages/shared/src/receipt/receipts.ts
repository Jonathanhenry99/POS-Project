// Penyusun struk: data transaksi -> daftar baris. Murni (tanpa efek samping) agar mudah dites.
import { formatDateTime, formatNumber, formatRupiah } from '../format';
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from '../permissions';
import type { Order, Shift, StoreSettings } from '../types';
import type { Align, ReceiptOp } from './escpos';
import { rule, twoCol, wrap, wrapIndented } from './layout';

export interface ReceiptLayout {
  /** Karakter per baris: 32 untuk 58 mm, 48 untuk 80 mm. */
  width: number;
  /** Baris kosong di akhir agar struk bisa disobek. */
  feedLines: number;
  /** Kirim perintah potong kertas (hanya untuk printer ber-cutter). */
  cut: boolean;
  /** Buka laci uang setelah transaksi tunai. */
  openDrawer: boolean;
}

export const DEFAULT_LAYOUT: ReceiptLayout = { width: 32, feedLines: 4, cut: false, openDrawer: false };

class Doc {
  ops: ReceiptOp[] = [];
  constructor(readonly width: number) {}

  text(text: string, opts: { align?: Align; bold?: boolean; tall?: boolean } = {}) {
    this.ops.push({ kind: 'text', text, ...opts });
    return this;
  }
  lines(lines: string[], opts: { align?: Align; bold?: boolean; tall?: boolean } = {}) {
    for (const l of lines) this.text(l, opts);
    return this;
  }
  wrapped(text: string, opts: { align?: Align; bold?: boolean; tall?: boolean } = {}) {
    return this.lines(wrap(text, this.width), opts);
  }
  cols(left: string, right: string, opts: { bold?: boolean; tall?: boolean } = {}) {
    return this.lines(twoCol(left, right, this.width), opts);
  }
  rule(ch = '-') {
    return this.text(rule(this.width, ch));
  }
  finish(layout: ReceiptLayout, drawer = false) {
    if (drawer && layout.openDrawer) this.ops.push({ kind: 'drawer' });
    if (layout.feedLines > 0) this.ops.push({ kind: 'feed', lines: layout.feedLines });
    if (layout.cut) this.ops.push({ kind: 'cut' });
    return this.ops;
  }
}

function header(doc: Doc, store: StoreSettings) {
  doc.wrapped(store.name || 'TOKO', { align: 'center', bold: true, tall: true });
  if (store.address) doc.wrapped(store.address, { align: 'center' });
  if (store.phone) doc.wrapped(store.phone, { align: 'center' });
  doc.rule();
}

/** Label kiri dengan titik dua sejajar: "Kasir : Rina" */
function info(doc: Doc, label: string, value: string) {
  const prefix = label.padEnd(6) + ': ';
  const lines = wrap(value, doc.width - prefix.length);
  lines.forEach((l, i) => doc.text((i === 0 ? prefix : ' '.repeat(prefix.length)) + l));
}

function pct(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

export function saleReceipt(
  order: Order,
  store: StoreSettings,
  layout: ReceiptLayout,
  opts: { reprint?: boolean; bill?: boolean } = {},
): ReceiptOp[] {
  const w = layout.width;
  const doc = new Doc(w);
  header(doc, store);

  if (opts.bill) doc.text('TAGIHAN - BELUM DIBAYAR', { align: 'center', bold: true });
  else if (order.status === 'void') doc.text('*** DIBATALKAN ***', { align: 'center', bold: true });
  else if (opts.reprint) doc.text('*** CETAK ULANG ***', { align: 'center', bold: true });

  if (!opts.bill) info(doc, 'No', order.number);
  info(doc, 'Waktu', formatDateTime(order.createdAt, store.timezone));
  info(doc, 'Kasir', order.cashierName);
  if (order.customerName) info(doc, 'Nama', order.customerName);
  if (order.orderType) doc.text(ORDER_TYPE_LABEL[order.orderType].toUpperCase(), { align: 'center', bold: true });
  doc.rule();

  for (const item of order.items) {
    doc.wrapped(item.name, { bold: true });
    if (item.options.length) doc.lines(wrapIndented(item.options.map((o) => o.name).join(', '), w, 2));
    if (item.note) doc.lines(wrapIndented(`Ctt: ${item.note}`, w, 2));
    doc.cols(`  ${item.qty} x ${formatNumber(item.unitPrice)}`, formatNumber(item.lineTotal));
  }
  doc.rule();

  doc.cols('Subtotal', formatNumber(order.subtotal));
  if (order.discountAmount > 0 && order.discount) {
    const label = order.discount.type === 'percent' ? `Diskon ${pct(order.discount.value)}` : 'Diskon';
    doc.cols(label, formatNumber(-order.discountAmount));
  }
  if (order.serviceAmount > 0) doc.cols(`Service ${pct(order.servicePct)}`, formatNumber(order.serviceAmount));
  if (order.taxAmount > 0) doc.cols(`${order.taxLabel} ${pct(order.taxPct)}`, formatNumber(order.taxAmount));
  if (order.roundingAmount !== 0) doc.cols('Pembulatan', formatNumber(order.roundingAmount));
  doc.rule();
  doc.cols('TOTAL', formatRupiah(order.total), { bold: true, tall: true });

  const p = order.payment;
  if (opts.bill) {
    doc.rule();
    doc.wrapped('Silakan lakukan pembayaran di kasir.', { align: 'center' });
    return doc.finish(layout);
  }
  if (p.method === 'cash') {
    doc.cols(PAYMENT_LABEL.cash, formatRupiah(p.tendered));
    doc.cols('Kembali', formatRupiah(p.change));
  } else {
    doc.cols(PAYMENT_LABEL[p.method], formatRupiah(p.amount));
    if (p.reference) info(doc, 'Ref', p.reference);
  }

  if (order.status === 'void' && order.voidReason) {
    doc.rule();
    doc.wrapped(`Alasan batal: ${order.voidReason}`);
  }

  doc.rule();
  if (store.footer) doc.wrapped(store.footer, { align: 'center' });
  return doc.finish(layout, p.method === 'cash' && !opts.reprint && order.status === 'paid');
}

export function testReceipt(store: StoreSettings, layout: ReceiptLayout, driverLabel: string, nowIso: string): ReceiptOp[] {
  const w = layout.width;
  const doc = new Doc(w);
  header(doc, store);
  doc.text('TES PRINTER', { align: 'center', bold: true, tall: true });
  info(doc, 'Waktu', formatDateTime(nowIso, store.timezone));
  info(doc, 'Jalur', driverLabel);
  info(doc, 'Lebar', `${w} karakter`);
  doc.rule();
  const ruler = '1234567890'.repeat(Math.ceil(w / 10)).slice(0, w);
  doc.text(ruler);
  doc.text('Kiri');
  doc.text('Tengah', { align: 'center' });
  doc.text('Kanan', { align: 'right' });
  doc.text('Tebal', { bold: true });
  doc.text('Tinggi ganda', { tall: true });
  doc.wrapped('Nama menu yang sangat panjang sekali akan dibungkus ke baris berikutnya');
  doc.cols('Es Kopi Susu Gula Aren Large', formatNumber(1250000));
  doc.rule();
  doc.cols('TOTAL', formatRupiah(25000), { bold: true, tall: true });
  doc.rule();
  doc.text('Jika garis di atas pas satu baris,', { align: 'center' });
  doc.text('lebar kertas sudah benar.', { align: 'center' });
  return doc.finish(layout);
}

export function shiftReceipt(shift: Shift, store: StoreSettings, layout: ReceiptLayout): ReceiptOp[] {
  const doc = new Doc(layout.width);
  const tz = store.timezone;
  const s = shift.summary;
  header(doc, store);
  doc.text('REKAP TUTUP KASIR', { align: 'center', bold: true, tall: true });
  info(doc, 'Buka', `${formatDateTime(shift.openedAt, tz)} ${shift.openedByName}`);
  if (shift.closedAt) info(doc, 'Tutup', `${formatDateTime(shift.closedAt, tz)} ${shift.closedByName}`);
  doc.rule();
  if (s) {
    doc.cols('Transaksi', String(s.orderCount));
    doc.cols('Penjualan kotor', formatNumber(s.grossSales));
    if (s.discountTotal) doc.cols('Diskon', formatNumber(-s.discountTotal));
    if (s.serviceTotal) doc.cols('Service', formatNumber(s.serviceTotal));
    if (s.taxTotal) doc.cols('Pajak', formatNumber(s.taxTotal));
    doc.cols('Total penjualan', formatNumber(s.netSales), { bold: true });
    doc.rule();
    doc.text('Per metode bayar', { bold: true });
    doc.cols(`  ${PAYMENT_LABEL.cash}`, formatNumber(s.byMethod.cash));
    doc.cols(`  ${PAYMENT_LABEL.qris}`, formatNumber(s.byMethod.qris));
    doc.cols(`  ${PAYMENT_LABEL.card}`, formatNumber(s.byMethod.card));
    if (s.voidCount) doc.cols(`Void (${s.voidCount})`, formatNumber(s.voidAmount));
    doc.rule();
    doc.text('Kas', { bold: true });
    doc.cols('  Modal awal', formatNumber(shift.openingCash));
    doc.cols('  Penjualan tunai', formatNumber(s.byMethod.cash));
    if (s.cashIn) doc.cols('  Kas masuk', formatNumber(s.cashIn));
    if (s.cashOut) doc.cols('  Kas keluar', formatNumber(-s.cashOut));
    doc.cols('Kas seharusnya', formatNumber(s.expectedCash), { bold: true });
    if (shift.countedCash !== null) {
      doc.cols('Kas dihitung', formatNumber(shift.countedCash), { bold: true });
      const diff = shift.countedCash - s.expectedCash;
      doc.cols(diff === 0 ? 'Selisih (pas)' : diff > 0 ? 'Selisih (lebih)' : 'Selisih (kurang)', formatNumber(diff), {
        bold: true,
      });
    }
  }
  if (shift.cashMovements.length) {
    doc.rule();
    doc.text('Kas masuk/keluar', { bold: true });
    for (const m of shift.cashMovements) {
      doc.cols(`  ${m.type === 'in' ? '+' : '-'} ${m.note || '-'}`, formatNumber(m.type === 'in' ? m.amount : -m.amount));
    }
  }
  if (shift.closingNote) {
    doc.rule();
    doc.wrapped(`Catatan: ${shift.closingNote}`);
  }
  doc.rule();
  doc.text('Tanda tangan kasir:');
  doc.ops.push({ kind: 'feed', lines: 3 });
  doc.rule('_');
  return doc.finish(layout);
}
