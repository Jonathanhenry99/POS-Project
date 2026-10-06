import { AlertTriangle, ArrowRight, ClipboardList, Lightbulb, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatNumber, formatRupiah, STATION_LABEL, type StockLevel } from '@mourden/shared';
import { Badge, Card, ErrorNote, Segmented, cx } from '../../components/ui';
import { AreaChart, ColumnChart, Composition, KpiTile } from './charts';
import { formatDateLabel, today, useApi } from './hooks';
import { daysBetween, insights, netRevenue, useSummary, type Range } from './reportData';
import { LoadingGrid } from './ReportsPage';

interface Alerts {
  lowStock: StockLevel[];
  opnameVariances: { id: string; station: string; businessDate: string; userName: string; diffValue: number }[];
}

export function DashboardPage() {
  const [mode, setMode] = useState<'hari' | 'bulan'>('hari');
  const t = today();
  const range: Range = mode === 'hari' ? { from: t, to: t } : { from: `${t.slice(0, 8)}01`, to: t };
  const { data: s, prev, error } = useSummary(range);
  const alerts = useApi<Alerts>('/reports/alerts');

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <section className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-4 shadow-card">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Filter Dashboard</h1>
          <p className="text-sm text-fg-muted">
            {mode === 'hari' ? `Hari ini, ${formatDateLabel(t)} · dibanding kemarin` : `Bulan ini (1 – ${formatDateLabel(t)}) · dibanding periode sebelumnya`}
          </p>
        </div>
        <div className="w-56">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'hari', label: 'Hari' },
              { value: 'bulan', label: 'Bulan' },
            ]}
          />
        </div>
      </section>

      <ErrorNote>{error}</ErrorNote>
      {!s ? (
        <LoadingGrid />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
            <TopMenuCard names={s.topProducts.slice(0, 5)} />
            <div className="grid grid-cols-2 gap-3 rounded-3xl border border-line bg-surface p-3 shadow-card md:grid-cols-3">
              <KpiTile label="Penjualan Bersih" value={netRevenue(s)} prev={prev && netRevenue(prev)} format={formatRupiah} />
              <KpiTile label="Total Bill" value={s.orderCount} prev={prev?.orderCount} />
              <KpiTile label="Ukuran Bill" value={s.avgTicket} prev={prev?.avgTicket} format={formatRupiah} hint="Rata-rata per transaksi" />
              <KpiTile label="Laba Kotor" value={s.grossProfit} prev={prev?.grossProfit} format={formatRupiah} hint={`Margin ${s.grossMarginPct}%`} />
              <KpiTile label="Diskon" value={s.discountTotal} prev={prev?.discountTotal} invert format={formatRupiah} hint={`${s.discountCount} transaksi`} />
              <KpiTile label="Pembatalan" value={s.voidAmount} prev={prev?.voidAmount} invert format={formatRupiah} hint={`${s.voidCount} void`} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <Card title="Statistik Penjualan" icon={<TrendingUp className="size-4" />}>
              {mode === 'hari' ? (
                <ColumnChart
                  height={200}
                  format={formatRupiah}
                  data={Array.from({ length: 24 }, (_, h) => s.byHour.find((x) => x.hour === h) ?? { hour: h, count: 0, amount: 0 })
                    .filter((h) => h.hour >= 6 && h.hour <= 23)
                    .map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.amount, detail: `${h.count} transaksi` }))}
                />
              ) : (
                <AreaChart
                  format={formatRupiah}
                  data={daysBetween(range).map((d) => {
                    const row = s.byDay.find((x) => x.date === d);
                    return { label: formatDateLabel(d), value: row?.amount ?? 0, detail: `${row?.count ?? 0} transaksi` };
                  })}
                />
              )}
            </Card>
            <Card title="Analisa Otomatis" icon={<Lightbulb className="size-4" />}>
              <ul className="flex flex-col gap-2">
                {insights(s, prev).map((i, k) => (
                  <li
                    key={k}
                    style={{ animationDelay: `${k * 60}ms` }}
                    className={cx(
                      'animate-rise rounded-2xl border p-3 text-sm',
                      i.tone === 'good' && 'border-success/25 bg-success/6',
                      i.tone === 'warn' && 'border-warning/30 bg-warning/8',
                      i.tone === 'info' && 'border-primary/20 bg-primary/5',
                    )}
                  >
                    {i.text}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-extrabold tracking-tight">Komposisi</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Penjualan Dari Mode Penjualan">
                <Composition rows={s.byOrderType.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count} trx` }))} emptyText="Anda belum memiliki penjualan dari mode transaksi" />
              </Card>
              <Card title="Penjualan Dari Metode Pembayaran">
                <Composition rows={s.byMethod.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count} trx` }))} emptyText="Anda belum memiliki penjualan dari metode pembayaran" />
              </Card>
              <Card title="Penjualan Dari Kategori">
                <Composition rows={s.byCategory.map((c) => ({ label: c.name, value: c.amount, detail: `${c.qty} item` }))} emptyText="Anda belum memiliki penjualan dari kategori" />
              </Card>
            </div>
          </section>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Peringatan Stok"
          icon={<AlertTriangle className="size-4" />}
          action={
            <Link to="/admin/stok" className="text-sm font-semibold text-primary">
              Lihat stok
            </Link>
          }
        >
          <ErrorNote>{alerts.error}</ErrorNote>
          {alerts.data && !alerts.data.lowStock.length && <p className="text-sm text-success">Semua stok aman.</p>}
          <ul className="divide-y divide-line">
            {alerts.data?.lowStock.map((st) => (
              <li key={st.id} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-semibold">{st.name}</p>
                  <p className="text-xs text-fg-muted">
                    Sisa {formatNumber(st.stock)} {st.unit}
                    {st.daysLeft !== null && ` · ± ${st.daysLeft} hari lagi`} · {STATION_LABEL[st.station]}
                  </p>
                </div>
                <Badge tone={st.status === 'habis' ? 'red' : 'amber'}>{st.status === 'habis' ? 'Habis' : 'Menipis'}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 p-2.5 text-xs text-fg-muted">
            <Sparkles className="size-4 shrink-0 text-primary" />
            Perkiraan “hari lagi” dihitung dari rata-rata pemakaian 7 hari. Data pergerakan stok sudah disiapkan untuk prediksi AI berikutnya.
          </p>
        </Card>
        <Card title="Selisih Opname 7 Hari" icon={<ClipboardList className="size-4" />}>
          {alerts.data && !alerts.data.opnameVariances.length && <p className="text-sm text-fg-muted">Tidak ada selisih opname.</p>}
          <ul className="divide-y divide-line">
            {alerts.data?.opnameVariances.map((o) => (
              <li key={o.id} className="flex justify-between gap-2 py-2.5 text-sm">
                <span>
                  {formatDateLabel(o.businessDate)} · {STATION_LABEL[o.station as keyof typeof STATION_LABEL]} · {o.userName}
                </span>
                <span className={cx('font-semibold tabular', o.diffValue < 0 ? 'text-danger' : 'text-success')}>{formatRupiah(o.diffValue)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TopMenuCard({ names }: { names: { name: string; qty: number }[] }) {
  return (
    <section className="animate-rise relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/10 blur-2xl" />
      <span className="bg-grad-primary w-fit rounded-full px-3 py-1 text-xs font-bold text-white">TERLARIS</span>
      <p className="mt-3 text-lg font-extrabold tracking-tight">Ini 5 menu terlaris di cafe Anda!</p>
      <p className="text-sm text-fg-muted">Pastikan stok bahannya aman dan tonjolkan di kasir.</p>
      <ol className="mt-3 flex flex-col gap-1.5">
        {names.length ? (
          names.map((n, i) => (
            <li key={n.name} className="flex items-center gap-2.5 text-sm" style={{ animation: `slide-in 300ms ${i * 60}ms both` }}>
              <span className={cx('grid size-6 place-items-center rounded-lg text-xs font-bold', i === 0 ? 'bg-grad-accent text-white' : 'bg-primary/10 text-primary')}>{i + 1}</span>
              <span className="flex-1 truncate font-semibold">{n.name}</span>
              <span className="text-fg-muted tabular">{n.qty}x</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-fg-subtle">Belum ada penjualan.</li>
        )}
      </ol>
      <Link
        to="/admin/laporan/menu"
        className="press mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#22b3a6] font-semibold text-white shadow-[0_10px_24px_-12px_var(--primary)]"
      >
        <Sparkles className="size-5" /> Cek Sekarang <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}
