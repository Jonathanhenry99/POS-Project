// Tipe & pengambil data laporan bersama untuk Dashboard dan halaman Laporan.
import { addDays, useApi } from './hooks';

export interface Summary {
  from: string;
  to: string;
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  serviceTotal: number;
  taxTotal: number;
  roundingTotal: number;
  netSales: number;
  avgTicket: number;
  voidCount: number;
  voidAmount: number;
  voidCash: { count: number; amount: number };
  voidNonCash: { count: number; amount: number };
  discountCount: number;
  byMethod: { method: string; label: string; count: number; amount: number }[];
  byHour: { hour: number; count: number; amount: number }[];
  byDay: { date: string; count: number; amount: number }[];
  topProducts: { productId: string; name: string; qty: number; amount: number }[];
  byCategory: { name: string; qty: number; amount: number }[];
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  heatmap: { dow: number; hour: number; count: number; amount: number }[];
  slowMovers: { id: string; name: string }[];
  byOrderType: { type: string; label: string; count: number; amount: number }[];
}

export interface Range {
  from: string;
  to: string;
}

/** Penjualan bersih ala ESB = total penjualan - diskon (belum termasuk service/pajak). */
export const netRevenue = (s: Summary) => s.grossSales - s.discountTotal;

/** Periode pembanding dengan panjang yang sama tepat sebelum rentang ini. */
export function previousRange(r: Range): Range {
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;
  return { from: addDays(r.from, -days), to: addDays(r.from, -1) };
}

export function useSummary(range: Range) {
  const now = useApi<Summary>(`/reports/summary?from=${range.from}&to=${range.to}`);
  const prevRange = previousRange(range);
  const prev = useApi<Summary>(`/reports/summary?from=${prevRange.from}&to=${prevRange.to}`);
  return { ...now, prev: prev.data ?? undefined };
}

/** Semua tanggal di rentang (agar hari tanpa penjualan tetap tampil sebagai 0). */
export function daysBetween(r: Range): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Insight otomatis berbasis aturan (tanpa AI) dari ringkasan penjualan. */
export function insights(s: Summary, prev?: Summary): { tone: 'good' | 'warn' | 'info'; text: string }[] {
  const out: { tone: 'good' | 'warn' | 'info'; text: string }[] = [];
  if (!s.orderCount) return [{ tone: 'info', text: 'Belum ada transaksi di periode ini.' }];
  const rev = netRevenue(s);
  if (prev && netRevenue(prev) > 0) {
    const pct = Math.round(((rev - netRevenue(prev)) / netRevenue(prev)) * 100);
    out.push({ tone: pct >= 0 ? 'good' : 'warn', text: `Penjualan bersih ${pct >= 0 ? 'naik' : 'turun'} ${Math.abs(pct)}% dibanding periode sebelumnya.` });
  }
  const peak = [...s.byHour].sort((a, b) => b.amount - a.amount)[0];
  if (peak) out.push({ tone: 'info', text: `Jam tersibuk pukul ${String(peak.hour).padStart(2, '0')}:00 (${peak.count} transaksi). Pastikan stok & staf siap sebelum jam ini.` });
  const top = s.topProducts[0];
  const items = s.topProducts.reduce((a, p) => a + p.qty, 0);
  if (top && items) out.push({ tone: 'good', text: `${top.name} paling laku: ${top.qty} terjual.` });
  if (s.grossMarginPct > 0 && s.grossMarginPct < 55) out.push({ tone: 'warn', text: `Margin kotor ${s.grossMarginPct}% tergolong rendah untuk cafe. Cek HPP menu di Resep & HPP.` });
  const voidRate = s.voidCount / (s.orderCount + s.voidCount);
  if (voidRate >= 0.05) out.push({ tone: 'warn', text: `Void ${s.voidCount}x (${Math.round(voidRate * 100)}% transaksi). Periksa alasan di laporan Batal & Void.` });
  const discRate = s.grossSales ? s.discountTotal / s.grossSales : 0;
  if (discRate >= 0.1) out.push({ tone: 'warn', text: `Diskon mencapai ${Math.round(discRate * 100)}% dari penjualan.` });
  if (s.slowMovers.length) out.push({ tone: 'info', text: `${s.slowMovers.length} menu belum terjual sama sekali, misalnya ${s.slowMovers.slice(0, 2).map((p) => p.name).join(' & ')}.` });
  return out;
}
