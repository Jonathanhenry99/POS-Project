import { CalendarDays, Download, HelpCircle, ShieldAlert, TrendingUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { formatDateTime, formatNumber, formatRupiah, type Order } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, Button, Card, Empty, ErrorNote, Skeleton, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { AreaChart, ColumnChart, Composition, Heatmap, KpiTile } from './charts';
import { addDays, formatDateLabel, storeTimezone, today, useApi } from './hooks';
import { daysBetween, netRevenue, useSummary, type Range, type Summary } from './reportData';

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastmonth' | 'custom';

function rangeFor(p: Preset, custom: Range): Range {
  const t = today();
  switch (p) {
    case 'today':
      return { from: t, to: t };
    case 'yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case '7d':
      return { from: addDays(t, -6), to: t };
    case '30d':
      return { from: addDays(t, -29), to: t };
    case 'month':
      return { from: `${t.slice(0, 8)}01`, to: t };
    case 'lastmonth': {
      const firstThis = `${t.slice(0, 8)}01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    default:
      return custom;
  }
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Hari ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: 'month', label: 'Bulan ini' },
  { id: 'lastmonth', label: 'Bulan lalu' },
];

/** Kartu filter ala ESB: Tanggal Pesan + Unduh + Tampilkan. */
export function FilterCard({ value, onApply, extra, exportable = true }: { value: Range; onApply: (r: Range) => void; extra?: ReactNode; exportable?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api<Response>(`/reports/orders.csv?from=${value.from}&to=${value.to}`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `transaksi_${value.from}_${value.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="animate-rise mb-4 rounded-3xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-sm font-semibold text-fg-muted">Tanggal Pesan</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-line bg-surface-2 focus-within:border-primary">
              <span className="grid h-full w-12 place-items-center bg-primary text-white">
                <CalendarDays className="size-5" />
              </span>
              <input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="h-full bg-transparent px-3 font-semibold outline-none" aria-label="Dari tanggal" />
              <span className="text-fg-subtle">–</span>
              <input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="h-full bg-transparent px-3 font-semibold outline-none" aria-label="Sampai tanggal" />
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {PRESETS.map((p) => {
                const r = rangeFor(p.id, draft);
                const active = r.from === value.from && r.to === value.to;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setDraft(r);
                      onApply(r);
                    }}
                    className={cx('press h-10 shrink-0 rounded-xl border px-3 text-sm font-semibold', active ? 'border-primary bg-primary/10 text-primary' : 'border-line text-fg-muted hover:text-fg')}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {extra}
        <div className="flex gap-2">
          {exportable && (
            <Button variant="outline" className="border-primary/50 text-primary" icon={<Download className="size-5" />} loading={exporting} onClick={exportCsv}>
              Unduh
            </Button>
          )}
          <button onClick={() => onApply(draft)} className="press bg-grad-accent h-12 rounded-xl px-6 font-semibold text-white shadow-[0_10px_24px_-12px_var(--accent)]">
            Tampilkan
          </button>
        </div>
      </div>
    </section>
  );
}

/** Filter tanggal ringkas untuk halaman lain (transaksi, tutup kasir, stok). */
export function DateRangeBar({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return <FilterCard value={value} onApply={onChange} exportable={false} />;
}

export function ReportsPage() {
  const [range, setRange] = useState<Range>(() => rangeFor('7d', { from: today(), to: today() }));
  const summary = useSummary(range);
  const s = summary.data;
  return (
    <div className="p-4 lg:p-6">
      <FilterCard value={range} onApply={setRange} />
      <ErrorNote>{summary.error}</ErrorNote>
      {!s ? (
        <LoadingGrid />
      ) : (
        <Routes>
          <Route index element={<Rangkuman s={s} prev={summary.prev} range={range} />} />
          <Route path="menu" element={<MenuReport s={s} />} />
          <Route path="pembayaran" element={<PaymentReport s={s} />} />
          <Route path="void" element={<VoidReport s={s} range={range} />} />
          <Route path="laba" element={<ProfitReport s={s} prev={summary.prev} />} />
        </Routes>
      )}
    </div>
  );
}

export function LoadingGrid() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

const WEEKDAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function Rangkuman({ s, prev, range }: { s: Summary; prev?: Summary; range: Range }) {
  const days = daysBetween(range);
  const byDate = new Map(s.byDay.map((d) => [d.date, d]));
  const hours = Array.from({ length: 24 }, (_, h) => s.byHour.find((x) => x.hour === h) ?? { hour: h, count: 0, amount: 0 });
  const used = hours.filter((h) => h.count > 0);
  const hourRange = used.length ? hours.slice(Math.max(0, used[0].hour - 1), Math.min(24, used[used.length - 1].hour + 2)) : [];
  const weekday = WEEKDAYS.map((label, i) => {
    const cells = s.heatmap.filter((c) => c.dow === i + 1);
    return { label, value: cells.reduce((a, c) => a + c.amount, 0), detail: `${cells.reduce((a, c) => a + c.count, 0)} transaksi` };
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Penjualan Bersih" value={netRevenue(s)} prev={prev && netRevenue(prev)} format={formatRupiah} spark={days.map((d) => byDate.get(d)?.amount ?? 0)} />
        <KpiTile label="Total Bill" value={s.orderCount} prev={prev?.orderCount} hint={s.voidCount ? `+${s.voidCount} void` : 'Tanpa void'} />
        <KpiTile label="Rata-rata Bill" value={s.avgTicket} prev={prev?.avgTicket} format={formatRupiah} />
        <KpiTile label="Laba Kotor" value={s.grossProfit} prev={prev?.grossProfit} format={formatRupiah} hint={`Margin ${s.grossMarginPct}%`} />
      </div>

      <Card title="Statistik Penjualan" icon={<TrendingUp className="size-4" />}>
        <AreaChart
          data={days.map((d) => ({ label: formatDateLabel(d), value: byDate.get(d)?.amount ?? 0, detail: `${byDate.get(d)?.count ?? 0} transaksi` }))}
          format={formatRupiah}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Penjualan Per Hari">
          <ColumnChart data={weekday} format={formatRupiah} />
        </Card>
        <Card title="Penjualan Per Waktu">
          <ColumnChart data={hourRange.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.amount, detail: `${h.count} transaksi` }))} format={formatRupiah} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Ringkasan Penjualan">
          <Ledger
            rows={[
              { label: 'Total Penjualan', value: s.grossSales, help: 'Harga menu x jumlah, sebelum diskon' },
              { label: 'Diskon', value: -s.discountTotal },
              { label: 'Total Penjualan Bersih', value: netRevenue(s), strong: true },
              { label: 'Service Charge', value: s.serviceTotal },
              { label: 'PB1 / Pajak', value: s.taxTotal },
              { label: 'Total Pembulatan', value: s.roundingTotal },
              { label: 'Total Penjualan Kotor', value: s.netSales, strong: true, help: 'Uang yang dibayar pelanggan' },
            ]}
          />
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Kontrol Fraud" icon={<ShieldAlert className="size-4" />}>
            <Ledger
              rows={[
                { label: `Diskon diberikan (${s.discountCount}x)`, value: s.discountTotal },
                { label: `Pembatalan (${s.voidCount}x)`, value: s.voidAmount, strong: true },
                { label: `Void - Tunai (${s.voidCash.count}x)`, value: s.voidCash.amount, indent: true },
                { label: `Void - Non Tunai (${s.voidNonCash.count}x)`, value: s.voidNonCash.amount, indent: true },
              ]}
            />
          </Card>
          <Card title="Metriks Penjualan">
            <Ledger
              number
              rows={[
                { label: 'Total Bill', value: s.orderCount },
                { label: 'Rata-rata Nilai Transaksi', value: s.avgTicket, money: true },
                { label: 'Item Terjual', value: s.topProducts.reduce((a, p) => a + p.qty, 0) },
              ]}
            />
          </Card>
        </div>
      </div>

      <Card title="Peta Jam Ramai">
        <Heatmap cells={s.heatmap} />
      </Card>
    </div>
  );
}

function Ledger({ rows, number }: { rows: { label: string; value: number; strong?: boolean; help?: string; indent?: boolean; money?: boolean }[]; number?: boolean }) {
  return (
    <dl className="flex flex-col">
      {rows.map((r) => (
        <div key={r.label} className={cx('flex items-center justify-between gap-3 rounded-xl px-3 py-2.5', r.strong && 'bg-primary/8 font-bold text-primary', r.indent && 'pl-8 text-fg-muted')}>
          <dt className="flex items-center gap-1.5">
            {r.label}
            {r.help && (
              <span title={r.help} aria-label={r.help}>
                <HelpCircle className="size-4 text-fg-subtle" />
              </span>
            )}
          </dt>
          <dd className="font-semibold tabular">{number && !r.money ? formatNumber(r.value) : formatRupiah(r.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function MenuReport({ s }: { s: Summary }) {
  const totalQty = s.topProducts.reduce((a, p) => a + p.qty, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card title="Penjualan Menu (15 teratas)">
        {!s.topProducts.length ? (
          <Empty title="Belum ada menu terjual" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary/6 text-left text-fg-muted">
                <th className="rounded-l-xl px-3 py-2">#</th>
                <th className="px-3 py-2">Menu</th>
                <th className="px-3 py-2 text-right">Terjual</th>
                <th className="rounded-r-xl px-3 py-2 text-right">Penjualan</th>
              </tr>
            </thead>
            <tbody>
              {s.topProducts.map((p, i) => (
                <tr key={p.productId + p.name} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">
                    <span className={cx('grid size-7 place-items-center rounded-lg text-xs font-bold', i < 3 ? 'bg-grad-accent text-white' : 'bg-surface-3 text-fg-muted')}>{i + 1}</span>
                  </td>
                  <td className="px-3 py-2.5 font-semibold">
                    {p.name}
                    <span className="mt-1 block h-1.5 rounded-full bg-surface-3">
                      <span className="block h-1.5 rounded-full bg-primary/80" style={{ width: `${(p.qty / (s.topProducts[0]?.qty || 1)) * 100}%` }} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {p.qty} <span className="text-xs text-fg-subtle">({totalQty ? Math.round((p.qty / totalQty) * 100) : 0}%)</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular">{formatNumber(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="flex flex-col gap-4">
        <Card title="Penjualan Dari Kategori">
          <Composition rows={s.byCategory.map((c) => ({ label: c.name, value: c.amount, detail: `${c.qty} item` }))} format={formatNumber} emptyText="Belum ada penjualan per kategori" />
        </Card>
        <Card title="Menu belum terjual">
          {!s.slowMovers.length ? (
            <p className="text-sm text-success">Semua menu aktif terjual di periode ini.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {s.slowMovers.map((p) => (
                <Badge key={p.id} tone="amber">
                  {p.name}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PaymentReport({ s }: { s: Summary }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Penjualan Dari Metode Pembayaran">
        <Composition rows={s.byMethod.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count} transaksi` }))} format={formatNumber} emptyText="Anda belum memiliki penjualan dari metode pembayaran" />
      </Card>
      <Card title="Penjualan Dari Mode Penjualan">
        <Composition rows={s.byOrderType.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count} transaksi` }))} format={formatNumber} emptyText="Anda belum memiliki penjualan dari mode transaksi" />
      </Card>
    </div>
  );
}

function VoidReport({ s, range }: { s: Summary; range: Range }) {
  const { data, error } = useApi<Order[]>(`/orders?from=${range.from}&to=${range.to}&status=void`);
  const tz = storeTimezone();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Total Pembatalan" value={s.voidAmount} format={formatRupiah} hint={`${s.voidCount} transaksi`} />
        <KpiTile label="Void Tunai" value={s.voidCash.amount} format={formatRupiah} hint={`${s.voidCash.count} transaksi · uang kembali ke pelanggan`} />
        <KpiTile label="Void Non Tunai" value={s.voidNonCash.amount} format={formatRupiah} hint={`${s.voidNonCash.count} transaksi`} />
        <KpiTile label="Rasio Void" value={s.orderCount + s.voidCount ? Math.round((s.voidCount / (s.orderCount + s.voidCount)) * 100) : 0} format={(n) => `${n}%`} hint="dari semua transaksi" />
      </div>
      <Card title="Daftar Batal & Void">
        <ErrorNote>{error}</ErrorNote>
        {data && !data.length && <Empty title="Tidak ada pembatalan di periode ini" />}
        {data && data.length > 0 && (
          <ul className="divide-y divide-line">
            {data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">
                    {o.number} <Badge tone="red">VOID</Badge>
                  </p>
                  <p className="text-sm text-fg-muted">
                    {formatDateTime(o.createdAt, tz)} · kasir {o.cashierName} · dibatalkan oleh {o.voidedByName}
                  </p>
                  <p className="text-sm text-danger">Alasan: {o.voidReason}</p>
                </div>
                <span className="font-bold tabular">{formatRupiah(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ProfitReport({ s, prev }: { s: Summary; prev?: Summary }) {
  const rev = netRevenue(s);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Penjualan Bersih" value={rev} prev={prev && netRevenue(prev)} format={formatRupiah} />
        <KpiTile label="HPP (modal bahan)" value={s.cogs} prev={prev?.cogs} invert format={formatRupiah} />
        <KpiTile label="Laba Kotor" value={s.grossProfit} prev={prev?.grossProfit} format={formatRupiah} />
        <KpiTile label="Margin Kotor" value={Math.round(s.grossMarginPct)} prev={prev && Math.round(prev.grossMarginPct)} format={(n) => `${n}%`} />
      </div>
      <Card title="Laba Rugi Sederhana">
        <Ledger
          rows={[
            { label: 'Total Penjualan Bersih', value: rev, strong: true },
            { label: 'HPP (bahan terpakai sesuai resep)', value: -s.cogs },
            { label: 'Laba Kotor', value: s.grossProfit, strong: true },
          ]}
        />
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
          HPP dihitung dari bahan yang terpotong otomatis saat penjualan (resep × harga beli terakhir). Menu tanpa resep dianggap HPP 0, jadi lengkapi resep di
          Inventori › Resep & HPP agar laba akurat. Biaya operasional (gaji, sewa, listrik) belum termasuk.
        </p>
      </Card>
    </div>
  );
}
