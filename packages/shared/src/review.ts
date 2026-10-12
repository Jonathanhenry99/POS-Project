// "Perlu ditinjau": menyaring aktivitas kasir yang berisiko menjadi daftar untuk owner.
// Murni: data mentah masuk, daftar berlabel & bertingkat risiko keluar.
import { formatRupiah } from './format';

export type CashierEventType = 'bill_printed' | 'order_deleted' | 'item_removed';

/** Dikirim tablet saat kasir mencetak tagihan, menghapus pesanan, atau mengurangi item setelah tagihan dicetak. */
export interface CashierEvent {
  id: string;
  at: string;
  type: CashierEventType;
  /** ID pesanan di tablet (checkoutId), penghubung cetak tagihan dengan penghapusan. */
  orderRef: string;
  label: string;
  amount: number;
  itemCount: number;
  /** Berapa kali tagihan pesanan ini sudah dicetak saat kejadian. */
  billPrints: number;
  reason: string;
  detail: string;
}

export type ReviewSeverity = 'high' | 'medium' | 'low';
export type ReviewKind = 'order_deleted' | 'item_removed' | 'bill_reprint' | 'void' | 'discount' | 'free_item' | 'drawer' | 'cash_diff' | 'comp';

export interface ReviewItem {
  key: string;
  kind: ReviewKind;
  severity: ReviewSeverity;
  at: string;
  actor: string;
  title: string;
  detail: string;
  amount: number;
  reviewed: boolean;
}

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  order_deleted: 'Pesanan dihapus',
  item_removed: 'Item dikurangi',
  bill_reprint: 'Tagihan ganda',
  void: 'Void',
  discount: 'Diskon besar',
  free_item: 'Menu Rp 0',
  drawer: 'Laci dibuka',
  cash_diff: 'Selisih kas',
  comp: 'Komplimen',
};

/** Diskon mulai persen ini dari subtotal masuk daftar tinjau. */
export const DISCOUNT_FLAG_PCT = 30;
/** Selisih kas tutup shift mulai nilai ini masuk daftar tinjau. */
export const CASH_DIFF_FLAG = 5000;

export interface ReviewSource {
  events: (CashierEvent & { userName: string })[];
  voids: { id: string; number: string; cashierName: string; voidedByName: string; reason: string; total: number; method: string; voidedAt: string; approved: boolean }[];
  discounts: { id: string; number: string; cashierName: string; at: string; subtotal: number; discountAmount: number; reason: string }[];
  freeItems: { id: string; number: string; cashierName: string; at: string; name: string; qty: number }[];
  drawers: { id: string; at: string; userName: string }[];
  shifts: { id: string; closedAt: string; closedByName: string; expectedCash: number; countedCash: number }[];
  /** Komplimen yang melebihi jatah harian (disetujui owner, atau lolos tanpa persetujuan). */
  comps?: { id: string; number: string; at: string; cashierName: string; employeeName: string; qty: number; value: number; approved: boolean; dayQty: number; perDay: number }[];
  reviewed: Set<string>;
}

export function buildReview(src: ReviewSource): ReviewItem[] {
  const out: Omit<ReviewItem, 'reviewed'>[] = [];
  const rp = formatRupiah;

  for (const e of src.events) {
    if (e.type === 'order_deleted') {
      const billed = e.billPrints > 0;
      out.push({
        key: `event:${e.id}`,
        kind: 'order_deleted',
        // Tagihan sudah dicetak lalu pesanan dihapus = pola "terima tunai, hapus pesanan".
        severity: billed ? 'high' : e.amount > 0 ? 'low' : 'low',
        at: e.at,
        actor: e.userName,
        title: billed ? 'Pesanan dihapus setelah tagihan dicetak' : 'Pesanan belum dibayar dihapus',
        detail: [e.label, `${e.itemCount} item`, e.detail, e.reason ? `Alasan: ${e.reason}` : 'Tanpa alasan'].filter(Boolean).join(' · '),
        amount: e.amount,
      });
    } else if (e.type === 'item_removed') {
      out.push({ key: `event:${e.id}`, kind: 'item_removed', severity: 'high', at: e.at, actor: e.userName, title: 'Item dikurangi setelah tagihan dicetak', detail: [e.label, e.detail, e.reason ? `Alasan: ${e.reason}` : ''].filter(Boolean).join(' · '), amount: e.amount });
    }
  }
  // Tagihan yang sama dicetak lebih dari sekali: bisa dipakai menagih dua meja dengan satu pesanan.
  const prints = new Map<string, (CashierEvent & { userName: string })[]>();
  for (const e of src.events) if (e.type === 'bill_printed' && e.orderRef) prints.set(e.orderRef, [...(prints.get(e.orderRef) ?? []), e]);
  for (const [ref, list] of prints) {
    if (list.length < 2) continue;
    const last = [...list].sort((a, b) => a.at.localeCompare(b.at))[list.length - 1];
    out.push({ key: `bill:${ref}`, kind: 'bill_reprint', severity: 'medium', at: last.at, actor: last.userName, title: `Tagihan dicetak ${list.length} kali`, detail: [last.label, `${last.itemCount} item`].filter(Boolean).join(' · '), amount: last.amount });
  }
  for (const v of src.voids) {
    const cash = v.method === 'cash';
    out.push({
      key: `void:${v.id}`,
      kind: 'void',
      severity: cash && !v.approved ? 'high' : 'medium',
      at: v.voidedAt,
      actor: v.voidedByName || v.cashierName,
      title: cash ? 'Void transaksi tunai' : 'Void transaksi non-tunai',
      detail: [`Struk ${v.number}`, `kasir ${v.cashierName}`, v.approved ? 'disetujui owner' : 'tanpa PIN owner', `Alasan: ${v.reason || '-'}`].join(' · '),
      amount: v.total,
    });
  }
  for (const d of src.discounts) {
    const pct = d.subtotal > 0 ? Math.round((d.discountAmount / d.subtotal) * 100) : 0;
    if (pct < DISCOUNT_FLAG_PCT) continue;
    out.push({ key: `discount:${d.id}`, kind: 'discount', severity: pct >= 50 ? 'high' : 'medium', at: d.at, actor: d.cashierName, title: `Diskon ${pct}%`, detail: [`Struk ${d.number}`, `dari ${rp(d.subtotal)}`, `Alasan: ${d.reason || '-'}`].join(' · '), amount: d.discountAmount });
  }
  for (const f of src.freeItems) {
    out.push({ key: `free:${f.id}`, kind: 'free_item', severity: 'medium', at: f.at, actor: f.cashierName, title: 'Menu Rp 0 terjual', detail: `${f.qty}x ${f.name} · Struk ${f.number}`, amount: 0 });
  }
  for (const d of src.drawers) {
    out.push({ key: `drawer:${d.id}`, kind: 'drawer', severity: 'medium', at: d.at, actor: d.userName, title: 'Laci uang dibuka tanpa transaksi', detail: 'Perintah buka laci dikirim dari halaman Printer.', amount: 0 });
  }
  for (const s of src.shifts) {
    const diff = s.countedCash - s.expectedCash;
    if (Math.abs(diff) < CASH_DIFF_FLAG) continue;
    out.push({
      key: `shift:${s.id}`,
      kind: 'cash_diff',
      severity: diff < 0 ? 'high' : 'medium',
      at: s.closedAt,
      actor: s.closedByName,
      title: diff < 0 ? `Kas kurang ${rp(-diff)}` : `Kas lebih ${rp(diff)}`,
      detail: `Tutup shift · dihitung ${rp(s.countedCash)} · seharusnya ${rp(s.expectedCash)}`,
      amount: diff,
    });
  }
  for (const c of src.comps ?? []) {
    out.push({
      key: `comp:${c.id}`,
      kind: 'comp',
      severity: c.approved ? 'medium' : 'high',
      at: c.at,
      actor: c.cashierName,
      title: c.approved ? `Komplimen ${c.employeeName} melebihi jatah (disetujui owner)` : `Komplimen ${c.employeeName} melebihi jatah tanpa persetujuan`,
      detail: `Struk ${c.number} · ${c.qty} item · menjadi ${c.dayQty} item hari itu, jatah ${c.perDay}`,
      amount: c.value,
    });
  }
  const rank: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };
  return out
    .map((i) => ({ ...i, reviewed: src.reviewed.has(i.key) }))
    .sort((a, b) => Number(a.reviewed) - Number(b.reviewed) || rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
}
