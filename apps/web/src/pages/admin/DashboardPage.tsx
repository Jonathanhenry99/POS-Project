import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  Lightbulb,
  Percent,
  QrCode,
  ReceiptText,
  Share,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatNumber, formatRupiah, formatTime, STATION_LABEL, type StockLevel } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, ErrorNote, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { Composition, Heatmap, shortNumber } from './charts';
import { formatDateLabel, storeTimezone, today, useApi, addDays } from './hooks';
import { daysBetween, downloadOrdersCsv, insights, netRevenue, useSummary, type Pulse, type Range, type Summary } from './reportData';
import { LoadingGrid } from './ReportsPage';
import type { ReviewData } from './ReviewPage';
import { DeltaPill, HighlightBars, MiniStat, ProgressRing, StatCard, TrendArea } from './widgets';

interface Alerts {
  lowStock: StockLevel[];
  opnameVariances: { id: string; station: string; businessDate: string; userName: string; diffValue: number }[];
}

type Mode = 'hari' | 'minggu' | 'bulan';
const MODES: { id: Mode; label: string; compare: string }[] = [
  { id: 'hari', label: 'Hari ini', compare: 'vs kemarin' },
  { id: 'minggu', label: '7 hari', compare: 'vs 7 hari lalu' },
  { id: 'bulan', label: 'Bulan ini', compare: 'vs periode lalu' },
];
const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const METHOD_ICON: Record<string, ReactNode> = { cash: <Banknote className="size-[18px]" />, qris: <QrCode className="size-[18px]" />, card: <CreditCard className="size-[18px]" /> };
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function DashboardPage() {
  const user = useApp((s) => s.user)!;
  const [mode, setMode] = useState<Mode>('hari');
  const [exporting, setExporting] = useState(false);
  const t = today();
  const range: Range = mode === 'hari' ? { from: t, to: t } : mode === 'minggu' ? { from: addDays(t, -6), to: t } : { from: `${t.slice(0, 8)}01`, to: t };
  const summary = useSummary(range);
  const { data: s, prev, error } = summary;
  const pulse = useApi<Pulse>('/reports/pulse');
  const alerts = useApi<Alerts>('/reports/alerts');
  const review = useApi<ReviewData>(`/reports/review?from=${addDays(t, -6)}&to=${t}`);
  const compare = MODES.find((m) => m.id === mode)!.compare;

  // Penjualan hari ini diperbarui otomatis tiap menit selama halaman terlihat.
  const { reload } = summary;
  const reloadPulse = pulse.reload;
  const [updatedAt, setUpdatedAt] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      reload();
      reloadPulse();
      setUpdatedAt(new Date().toISOString());
    }, 60_000);
    return () => clearInterval(timer);
  }, [reload, reloadPulse]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadOrdersCsv(range);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Selamat datang, {user.name.split(' ')[0]} 👋</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
            Ringkasan penjualan, menu, dan stok cafe Anda.
            <span className="flex items-center gap-1.5 text-fg-subtle">
              <span className="live-dot" /> Live · diperbarui {formatTime(updatedAt, storeTimezone())}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="pill-group" role="group" aria-label="Periode">
            {MODES.map((m) => (
              <button key={m.id} className="pill" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <button className="btn-soft" onClick={() => void exportCsv()} disabled={exporting}>
            <Share className="size-4" /> {exporting ? 'Menyiapkan…' : 'Ekspor laporan'}
          </button>
        </div>
      </header>

      <ErrorNote>{error}</ErrorNote>
      {!s ? (
        <>
          <LoadingGrid />
          <StockWatch alerts={alerts} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Penjualan Bersih" value={netRevenue(s)} prev={prev && netRevenue(prev)} format={formatRupiah} compare={compare} icon={<ChartNoAxesCombined className="size-[18px]" />} to="/admin/laporan" />
            <StatCard label="Total Bill" value={s.orderCount} prev={prev?.orderCount} compare={compare} icon={<ReceiptText className="size-[18px]" />} to="/admin/transaksi" delay={50} />
            <StatCard label="Rata-rata Bill" value={s.avgTicket} prev={prev?.avgTicket} format={formatRupiah} compare={compare} icon={<Wallet className="size-[18px]" />} to="/admin/laporan" delay={100} />
            <StatCard label="Laba Kotor" value={s.grossProfit} prev={prev?.grossProfit} format={formatRupiah} compare={`margin ${String(s.grossMarginPct).replace('.', ',')}%`} icon={<Sparkles className="size-[18px]" />} to="/admin/laporan/laba" delay={150} />
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MiniStat label="Diskon" value={formatRupiah(s.discountTotal)} hint={`${s.discountCount} transaksi`} icon={<Percent className="size-[18px]" />} />
            <MiniStat label="Pembatalan (void)" value={formatRupiah(s.voidAmount)} hint={`${s.voidCount} transaksi`} icon={<Undo2 className="size-[18px]" />} />
            <MiniStat label="Item per bill" value={s.orderCount ? (s.itemCount / s.orderCount).toFixed(1).replace('.', ',') : '0'} hint={`${formatNumber(s.itemCount)} item terjual`} icon={<ShoppingBag className="size-[18px]" />} />
            <MiniStat label="Tamu dine in" value={formatNumber(s.paxTotal)} hint={s.paxTotal ? `${formatRupiah(Math.round(netRevenue(s) / s.paxTotal))} per tamu` : 'Isi jumlah tamu di kasir'} icon={<Users className="size-[18px]" />} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <SalesOverview s={s} prev={prev} mode={mode} range={range} />
            <TopMenu s={s} />
          </div>

          {/* Pengawasan, stok & opname sengaja di tengah: owner perlu melihatnya tanpa menggulir sampai bawah. */}
          <ReviewBanner review={review.data} />
          <StockWatch alerts={alerts} />

          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <OrdersCard s={s} prev={prev} mode={mode} range={range} />
            <BusyHours pulse={pulse.data} s={s} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <TargetCard pulse={pulse.data} />
            <Panel title="Analisa Otomatis" icon={<Lightbulb className="size-[18px]" />}>
              <ul className="flex flex-col gap-2">
                {insights(s, prev).map((i, k) => (
                  <li key={k} style={{ animationDelay: `${k * 60}ms` }} className="tile-soft animate-rise flex gap-2.5 p-3 text-sm">
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', i.tone === 'good' ? 'bg-success' : i.tone === 'warn' ? 'bg-warning' : 'bg-[var(--violet)]')} />
                    {i.text}
                  </li>
                ))}
              </ul>
            </Panel>
            <RecentOrders s={s} />
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Komposisi penjualan</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Mode Penjualan">
                <Composition rows={s.byOrderType.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count} trx` }))} emptyText="Belum ada penjualan dari mode transaksi" />
              </Panel>
              <Panel title="Metode Pembayaran">
                <Composition rows={s.byMethod.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count} trx` }))} emptyText="Belum ada penjualan dari metode pembayaran" />
              </Panel>
              <Panel title="Kategori">
                <Composition rows={s.byCategory.map((c) => ({ label: c.name, value: c.amount, detail: `${c.qty} item` }))} emptyText="Belum ada penjualan dari kategori" />
              </Panel>
            </div>
          </section>

          <CashierPerformance s={s} />
        </>
      )}

    </div>
  );
}

/** Ringkasan aktivitas kasir yang belum ditinjau (7 hari terakhir). */
function ReviewBanner({ review }: { review: ReviewData | null }) {
  if (!review) return null;
  const clear = review.open === 0;
  // .tile dan .icon-chip mengatur bayangan/latar sendiri, jadi warna status dipasang lewat outline & style.
  const tone = review.high ? { background: 'color-mix(in oklab, var(--danger) 13%, white)', color: 'var(--danger)' } : clear ? { background: 'color-mix(in oklab, var(--success) 13%, white)', color: 'var(--success)' } : { background: 'color-mix(in oklab, var(--warning) 18%, white)', color: '#8a5a00' };
  return (
    <Link to="/admin/tinjau" className={cx('tile animate-rise flex flex-wrap items-center gap-3 p-4 outline-2', review.high ? 'outline-danger/35' : 'outline-transparent')}>
      <span className="icon-chip" style={tone}>{clear ? <ShieldCheck className="size-[18px]" /> : <ShieldAlert className="size-[18px]" />}</span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold">{clear ? 'Tidak ada aktivitas kasir yang perlu ditinjau' : `${review.open} aktivitas kasir perlu ditinjau`}</p>
        <p className="text-sm text-fg-muted">
          {clear ? '7 hari terakhir: tidak ada void, diskon besar, penghapusan pesanan, atau selisih kas yang belum ditinjau.' : `${review.high} risiko tinggi · 7 hari terakhir · void, diskon besar, pesanan dihapus setelah tagihan, selisih kas`}
        </p>
      </div>
      <span className="flex items-center gap-1 text-sm font-semibold">
        Tinjau <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}

const STOCK_PREVIEW = 5;

/** Peringatan stok (bahan paling kritis dulu) + selisih opname 7 hari. */
function StockWatch({ alerts }: { alerts: { data: Alerts | null; error: string } }) {
  const low = [...(alerts.data?.lowStock ?? [])].sort((a, b) => Number(b.status === 'habis') - Number(a.status === 'habis') || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name));
  const out = low.filter((x) => x.status === 'habis').length;
  const variances = alerts.data?.opnameVariances ?? [];
  const diffTotal = variances.reduce((n, o) => n + o.diffValue, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Peringatan Stok"
        icon={<AlertTriangle className="size-[18px]" />}
        sub={alerts.data ? (low.length ? `${out} habis · ${low.length - out} menipis` : 'Tidak ada bahan yang perlu dibeli') : undefined}
        action={
          <Link to="/admin/stok" className="flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
            Lihat stok <ArrowUpRight className="size-3.5" />
          </Link>
        }
      >
        <ErrorNote>{alerts.error}</ErrorNote>
        {!alerts.data && !alerts.error && <div className="skeleton h-24" />}
        {alerts.data && !low.length && <p className="text-sm text-success">Semua stok aman.</p>}
        <ul className="flex flex-col gap-2">
          {low.slice(0, STOCK_PREVIEW).map((st) => (
            <li key={st.id} className="tile-soft flex items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-semibold">{st.name}</p>
                <p className="text-xs text-fg-muted">
                  Sisa {formatNumber(st.stock)} {st.unit}
                  {st.daysLeft !== null && ` · ± ${st.daysLeft} hari lagi`} · {STATION_LABEL[st.station]}
                </p>
              </div>
              <Badge tone={st.status === 'habis' ? 'red' : 'amber'}>{st.status === 'habis' ? 'Habis' : 'Menipis'}</Badge>
            </li>
          ))}
        </ul>
        {low.length > STOCK_PREVIEW && (
          <Link to="/admin/stok" className="mt-2 flex items-center justify-center gap-1 rounded-2xl py-2.5 text-sm font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg">
            + {low.length - STOCK_PREVIEW} bahan lain <ArrowUpRight className="size-3.5" />
          </Link>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-fg-muted">
          <Sparkles className="size-4 shrink-0 text-[var(--violet)]" />
          Perkiraan “hari lagi” dihitung dari rata-rata pemakaian 7 hari. Data pergerakan stok sudah disiapkan untuk prediksi AI berikutnya.
        </p>
      </Panel>
      <Panel
        title="Selisih Opname 7 Hari"
        icon={<ClipboardList className="size-[18px]" />}
        sub={alerts.data ? (variances.length ? `${variances.length} opname berselisih` : 'Hitungan fisik cocok dengan sistem') : undefined}
        action={
          variances.length ? (
            <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold tabular', diffTotal < 0 ? 'bg-danger/12 text-danger' : 'bg-success/12 text-success')}>Total {formatRupiah(diffTotal)}</span>
          ) : undefined
        }
      >
        {!alerts.data && !alerts.error && <div className="skeleton h-24" />}
        {alerts.data && !variances.length && <p className="text-sm text-fg-muted">Tidak ada selisih opname.</p>}
        <ul className="flex flex-col gap-2">
          {variances.map((o) => (
            <li key={o.id} className="tile-soft flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {STATION_LABEL[o.station as keyof typeof STATION_LABEL]} · {o.userName}
                </p>
                <p className="text-xs text-fg-muted">{formatDateLabel(o.businessDate)}</p>
              </div>
              <span className={cx('font-semibold whitespace-nowrap tabular', o.diffValue < 0 ? 'text-danger' : 'text-success')}>{formatRupiah(o.diffValue)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/** Kartu putih bersudut besar dengan judul, ikon dan aksi opsional. */
function Panel({ title, sub, icon, action, children, className }: { title: string; sub?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('tile animate-rise flex min-w-0 flex-col p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            {icon && <span className="text-fg-muted">{icon}</span>}
            {title}
          </h3>
          {sub && <p className="mt-0.5 text-xs text-fg-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Deret waktu sesuai periode: per jam untuk hari ini, per hari untuk 7 hari / bulan ini. */
function series(s: Summary, mode: Mode, range: Range, pick: (r: { count: number; amount: number }) => number, detail: (r: { count: number; amount: number }) => string) {
  if (mode === 'hari') {
    const hours = s.byHour.map((h) => h.hour);
    const from = Math.min(7, ...hours);
    const to = Math.max(22, ...hours);
    return Array.from({ length: to - from + 1 }, (_, k) => {
      const row = s.byHour.find((x) => x.hour === from + k) ?? { count: 0, amount: 0 };
      return { label: hh(from + k), axis: String(from + k).padStart(2, '0'), value: pick(row), detail: detail(row) };
    });
  }
  return daysBetween(range).map((d) => {
    const row = s.byDay.find((x) => x.date === d) ?? { count: 0, amount: 0 };
    const date = new Date(`${d}T00:00:00Z`);
    const label = mode === 'minggu' ? date.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' }) : String(date.getUTCDate());
    return { label, value: pick(row), detail: `${formatDateLabel(d)} · ${detail(row)}` };
  });
}

function SalesOverview({ s, prev, mode, range }: { s: Summary; prev?: Summary; mode: Mode; range: Range }) {
  return (
    <Panel title="Ringkasan Penjualan" sub={mode === 'hari' ? 'Total dibayar pelanggan per jam' : 'Total dibayar pelanggan per hari'}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <p className="text-[26px] leading-none font-semibold tracking-tight whitespace-nowrap tabular sm:text-[34px]">{formatRupiah(s.netSales)}</p>
          <DeltaPill now={s.netSales} prev={prev?.netSales} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {s.byMethod.slice(0, 3).map((m) => (
            <div key={m.method} className="flex items-center gap-2.5">
              <span className="icon-chip">{METHOD_ICON[m.method] ?? <Wallet className="size-[18px]" />}</span>
              <div className="leading-tight">
                <p className="text-xs text-fg-muted">{m.label}</p>
                <p className="text-sm font-semibold tabular">{m.count} transaksi</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <HighlightBars valueLabel="penjualan" format={formatRupiah} data={series(s, mode, range, (r) => r.amount, (r) => `${r.count} transaksi`)} />
    </Panel>
  );
}

function TopMenu({ s }: { s: Summary }) {
  const top = s.topProducts.slice(0, 6);
  return (
    <Panel
      title="Menu Terlaris"
      action={
        <Link to="/admin/laporan/menu" className="flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
          Semua <ArrowUpRight className="size-3.5" />
        </Link>
      }
    >
      {!top.length ? (
        <p className="py-8 text-center text-sm text-fg-subtle">Belum ada penjualan.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {top.map((p, i) => (
            <li key={p.productId ?? p.name} className="tile-soft flex items-center gap-3 p-2.5" style={{ animation: `slide-in 300ms ${i * 50}ms both` }}>
              <span className={cx('grid size-11 shrink-0 place-items-center rounded-[14px] text-sm font-bold', i === 0 ? 'bg-[var(--lime)] text-[var(--lime-ink)]' : 'bg-surface text-fg-muted')}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-fg-muted">{formatNumber(p.qty)} terjual</p>
              </div>
              <p className="font-semibold tabular">{shortNumber(p.amount)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function OrdersCard({ s, prev, mode, range }: { s: Summary; prev?: Summary; mode: Mode; range: Range }) {
  const diff = prev ? s.orderCount - prev.orderCount : null;
  return (
    <Panel title="Pesanan" sub={range.from === range.to ? formatDateLabel(range.from) : `${formatDateLabel(range.from)} – ${formatDateLabel(range.to)}`}>
      <p className="text-[40px] leading-none font-semibold tracking-tight tabular">{formatNumber(s.orderCount)}</p>
      <div className="mt-3 mb-2 flex items-center gap-2.5">
        <DeltaPill now={s.orderCount} prev={prev?.orderCount} />
        {diff !== null && (
          <span className="text-sm text-fg-muted tabular">
            {diff >= 0 ? '+' : ''}
            {formatNumber(diff)} bill
          </span>
        )}
      </div>
      <TrendArea data={series(s, mode, range, (r) => r.count, (r) => formatRupiah(r.amount))} format={(n) => `${formatNumber(n)} bill`} />
    </Panel>
  );
}

function BusyHours({ pulse, s }: { pulse: Pulse | null; s: Summary }) {
  const cells = pulse?.heatmap ?? [];
  const sum = <K extends 'hour' | 'dow'>(key: K) => {
    const m = new Map<number, number>();
    for (const c of cells) m.set(c[key], (m.get(c[key]) ?? 0) + c.count);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  };
  const busiest = sum('hour');
  const bestDay = sum('dow');
  const dine = s.byOrderType.find((o) => o.type === 'dine_in')?.count ?? 0;
  const totalType = s.byOrderType.reduce((n, o) => n + o.count, 0);
  return (
    <Panel title="Jam Ramai" sub="Pola transaksi 4 minggu terakhir, per hari dan jam.">
      <div className="grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
        <dl className="grid grid-cols-3 gap-4 md:grid-cols-1">
          <Fact label="Jam tersibuk" value={busiest ? hh(busiest[0]) : '–'} hint={busiest ? `${formatNumber(busiest[1])} transaksi` : 'Belum ada data'} />
          <Fact label="Hari terbaik" value={bestDay ? DAY_NAMES[bestDay[0] - 1] : '–'} hint={bestDay ? `${formatNumber(bestDay[1])} transaksi` : ''} />
          <Fact label="Dine in" value={totalType ? `${Math.round((dine / totalType) * 100)}%` : '–'} hint={totalType ? `${Math.round(((totalType - dine) / totalType) * 100)}% take away` : 'di periode ini'} />
        </dl>
        <div className="min-w-0">
          <Heatmap cells={cells} />
        </div>
      </div>
    </Panel>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-[22px] leading-tight font-semibold tracking-tight tabular">{value}</dd>
      {hint && <dd className="text-xs text-fg-subtle">{hint}</dd>}
    </div>
  );
}

function TargetCard({ pulse }: { pulse: Pulse | null }) {
  const action = (
    <Link to="/admin/pengaturan" className="flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
      Atur <ArrowUpRight className="size-3.5" />
    </Link>
  );
  if (!pulse) return <Panel title="Target Bulan Ini" icon={<Target className="size-[18px]" />}><div className="skeleton h-32" /></Panel>;
  if (!pulse.target) {
    return (
      <Panel title="Target Bulan Ini" icon={<Target className="size-[18px]" />} action={action}>
        <div className="tile-soft flex flex-1 flex-col items-start justify-center gap-2 p-4">
          <p className="font-semibold">Belum ada target penjualan</p>
          <p className="text-sm text-fg-muted">
            Bulan ini sudah terkumpul <b className="text-fg">{formatRupiah(pulse.monthRevenue)}</b> dari {formatNumber(pulse.monthOrders)} bill. Pasang target bulanan supaya capaian dan proyeksinya terlihat di sini.
          </p>
          <Link to="/admin/pengaturan" className="pill pill-active mt-1">
            Pasang target
          </Link>
        </div>
      </Panel>
    );
  }
  const pct = (pulse.monthRevenue / pulse.target) * 100;
  const projection = Math.round((pulse.monthRevenue / pulse.dayOfMonth) * pulse.daysInMonth);
  const daysLeft = pulse.daysInMonth - pulse.dayOfMonth;
  const remaining = Math.max(0, pulse.target - pulse.monthRevenue);
  const onTrack = projection >= pulse.target;
  return (
    <Panel title="Target Bulan Ini" icon={<Target className="size-[18px]" />} action={action}>
      <div className="flex items-center gap-5">
        <ProgressRing pct={pct} label="Capaian target bulan ini" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">Terkumpul</p>
          <p className="truncate text-xl font-semibold tracking-tight tabular">{formatRupiah(pulse.monthRevenue)}</p>
          <p className="text-xs text-fg-muted">dari {formatRupiah(pulse.target)}</p>
          <span className={cx('mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold', remaining === 0 ? 'bg-[var(--lime)] text-[var(--lime-ink)]' : onTrack ? 'bg-success/12 text-success' : 'bg-warning/15 text-[#8a5a00]')}>
            {remaining === 0 ? 'Target tercapai' : onTrack ? 'Sesuai jalur' : 'Perlu dikejar'}
          </span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="tile-soft p-3">
          <dt className="text-xs text-fg-muted">Proyeksi akhir bulan</dt>
          <dd className="font-semibold tabular">{formatRupiah(projection)}</dd>
        </div>
        <div className="tile-soft p-3">
          <dt className="text-xs text-fg-muted">{daysLeft > 0 ? `Perlu per hari (${daysLeft} hari lagi)` : 'Hari terakhir bulan ini'}</dt>
          <dd className="font-semibold tabular">{formatRupiah(daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function RecentOrders({ s }: { s: Summary }) {
  const tz = storeTimezone();
  return (
    <Panel
      title="Transaksi Terbaru"
      icon={<ReceiptText className="size-[18px]" />}
      className="lg:col-span-2 xl:col-span-1"
      action={
        <Link to="/admin/transaksi" className="flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
          Semua <ArrowUpRight className="size-3.5" />
        </Link>
      }
    >
      {!s.recentOrders.length ? (
        <p className="py-8 text-center text-sm text-fg-subtle">Belum ada transaksi di periode ini.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {s.recentOrders.slice(0, 6).map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="icon-chip">{METHOD_ICON[o.method] ?? <Wallet className="size-[18px]" />}</span>
              <div className="min-w-0 flex-1">
                <p className={cx('truncate text-sm font-semibold', o.status === 'void' && 'text-fg-subtle line-through')}>{o.customerName || o.tableName || o.number}</p>
                <p className="truncate text-xs text-fg-muted">
                  {formatTime(o.createdAt, tz)} · {o.itemCount} item · {o.cashierName}
                </p>
              </div>
              {o.status === 'void' ? <Badge tone="red">Void</Badge> : <p className="text-sm font-semibold tabular">{formatNumber(o.total)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CashierPerformance({ s }: { s: Summary }) {
  const total = s.byCashier.reduce((n, c) => n + c.amount, 0);
  if (!s.byCashier.length) return null;
  return (
    <Panel
      title="Kinerja Kasir"
      icon={<Users className="size-[18px]" />}
      sub="Penjualan, rata-rata bill, diskon dan void per kasir di periode ini."
      action={
        <Link to="/admin/laporan/kasir" className="flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
          Detail <ArrowUpRight className="size-3.5" />
        </Link>
      }
    >
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {s.byCashier.map((c) => {
          const share = total ? (c.amount / total) * 100 : 0;
          return (
            <li key={c.name} className="tile-soft p-3.5">
              <div className="flex items-center gap-3">
                <span className="sidebar-avatar">{c.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-xs text-fg-muted">
                    {formatNumber(c.count)} bill · rata-rata {formatNumber(c.count ? Math.round(c.amount / c.count) : 0)}
                  </p>
                </div>
                <p className="font-semibold tabular">{shortNumber(c.amount)}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${Math.round(share)}% dari penjualan`}>
                <div className="h-full rounded-full bg-[var(--chart-3)]" style={{ width: `${share}%` }} />
              </div>
              <p className="mt-1.5 flex justify-between text-xs text-fg-muted">
                <span>{Math.round(share)}% penjualan</span>
                <span>
                  diskon {shortNumber(c.discountAmount)} · {c.voidCount} void
                </span>
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

