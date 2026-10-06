import { Download } from 'lucide-react';
import { useState } from 'react';
import { formatNumber, formatRupiah } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Button, Card, ErrorNote, Spinner, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { BarList, ColumnChart, StatTile } from './charts';
import { addDays, formatDateLabel, today, useApi } from './hooks';

export interface Summary {
  from: string;
  to: string;
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  serviceTotal: number;
  taxTotal: number;
  netSales: number;
  avgTicket: number;
  voidCount: number;
  voidAmount: number;
  byMethod: { method: string; label: string; count: number; amount: number }[];
  byHour: { hour: number; count: number; amount: number }[];
  byDay: { date: string; count: number; amount: number }[];
  topProducts: { productId: string; name: string; qty: number; amount: number }[];
  byCategory: { name: string; qty: number; amount: number }[];
}

export function SummaryView({ s, showDays }: { s: Summary; showDays: boolean }) {
  const hours = Array.from({ length: 24 }, (_, h) => s.byHour.find((x) => x.hour === h) ?? { hour: h, count: 0, amount: 0 });
  const first = hours.findIndex((h) => h.count > 0);
  const last = 23 - [...hours].reverse().findIndex((h) => h.count > 0);
  const hourRange = first === -1 ? [] : hours.slice(Math.max(0, first - 1), Math.min(24, last + 2));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Penjualan bersih" value={formatRupiah(s.netSales)} sub={`Kotor ${formatNumber(s.grossSales)} · diskon ${formatNumber(s.discountTotal)}`} />
        <StatTile label="Transaksi" value={formatNumber(s.orderCount)} sub={s.voidCount ? `${s.voidCount} void (${formatNumber(s.voidAmount)})` : 'Tidak ada void'} />
        <StatTile label="Rata-rata per transaksi" value={formatRupiah(s.avgTicket)} />
        <StatTile label="Service & pajak" value={formatRupiah(s.serviceTotal + s.taxTotal)} sub={`Service ${formatNumber(s.serviceTotal)} · pajak ${formatNumber(s.taxTotal)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {showDays && (
          <Card title="Penjualan per hari" className="lg:col-span-2">
            <ColumnChart data={s.byDay.map((d) => ({ label: formatDateLabel(d.date), value: d.amount, detail: `${d.count} transaksi` }))} format={formatRupiah} />
          </Card>
        )}
        <Card title="Penjualan per jam">
          <ColumnChart data={hourRange.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.amount, detail: `${h.count} transaksi` }))} format={formatRupiah} />
        </Card>
        <Card title="Per metode bayar">
          <BarList data={s.byMethod.map((m) => ({ label: m.label, value: m.amount, detail: `${m.count}x` }))} format={formatRupiah} />
        </Card>
        <Card title="Produk terlaris (jumlah terjual)">
          <BarList data={s.topProducts.map((p) => ({ label: p.name, value: p.qty, detail: formatRupiah(p.amount) }))} />
        </Card>
        <Card title="Per kategori">
          <BarList data={s.byCategory.map((c) => ({ label: c.name, value: c.amount, detail: `${c.qty} item` }))} format={formatRupiah} />
        </Card>
      </div>
    </div>
  );
}

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

function rangeFor(p: Preset, custom: { from: string; to: string }) {
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
    default:
      return custom;
  }
}

export function DateRangeBar({ value, onChange }: { value: { from: string; to: string }; onChange: (r: { from: string; to: string }) => void }) {
  const [preset, setPreset] = useState<Preset>('today');
  const presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Hari ini' },
    { id: 'yesterday', label: 'Kemarin' },
    { id: '7d', label: '7 hari' },
    { id: '30d', label: '30 hari' },
    { id: 'month', label: 'Bulan ini' },
    { id: 'custom', label: 'Pilih tanggal' },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            setPreset(p.id);
            if (p.id !== 'custom') onChange(rangeFor(p.id, value));
          }}
          className={cx('h-10 rounded-xl px-3 text-sm font-semibold', preset === p.id ? 'bg-brand-900 text-white' : 'bg-white text-stone-700')}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className={cx(inputClass, 'h-10 w-40')} />
          <span>–</span>
          <input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className={cx(inputClass, 'h-10 w-40')} />
        </div>
      )}
    </div>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState(() => rangeFor('today', { from: today(), to: today() }));
  const { data, error, loading } = useApi<Summary>(`/reports/summary?from=${range.from}&to=${range.to}`);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api<Response>(`/reports/orders.csv?from=${range.from}&to=${range.to}`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `transaksi_${range.from}_${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4">
      <PageHeader title="Laporan penjualan" subtitle={range.from === range.to ? formatDateLabel(range.from) : `${formatDateLabel(range.from)} – ${formatDateLabel(range.to)}`}>
        <Button variant="outline" icon={<Download className="size-5" />} loading={exporting} onClick={exportCsv}>
          Ekspor CSV
        </Button>
      </PageHeader>
      <DateRangeBar value={range} onChange={setRange} />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && <SummaryView s={data} showDays={range.from !== range.to} />}
    </div>
  );
}
