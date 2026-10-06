import { AlertTriangle, ClipboardList, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { formatNumber, formatRupiah, STATION_LABEL, type StockLevel } from '@mourden/shared';
import { Badge, Card, ErrorNote, Spinner } from '../../components/ui';
import { PageHeader } from './AdminRoutes';
import { formatDateLabel, today, useApi } from './hooks';
import { SummaryView, type Summary } from './ReportsPage';

interface Alerts {
  lowStock: StockLevel[];
  opnameVariances: { id: string; station: string; businessDate: string; userName: string; diffValue: number }[];
}

export function DashboardPage() {
  const t = today();
  const summary = useApi<Summary>(`/reports/summary?from=${t}&to=${t}`);
  const alerts = useApi<Alerts>('/reports/alerts');

  return (
    <div className="p-4">
      <PageHeader title="Beranda" subtitle={`Hari ini, ${formatDateLabel(t)}`} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div>
          <ErrorNote>{summary.error}</ErrorNote>
          {summary.loading && !summary.data && <Spinner className="mx-auto my-10" />}
          {summary.data && <SummaryView s={summary.data} showDays={false} />}
        </div>
        <div className="flex flex-col gap-4">
          <Card
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-600" /> Peringatan stok
              </span>
            }
            action={
              <Link to="/admin/stok" className="text-sm font-semibold text-brand-700">
                Lihat stok
              </Link>
            }
          >
            <ErrorNote>{alerts.error}</ErrorNote>
            {alerts.data && !alerts.data.lowStock.length && <p className="text-sm text-emerald-700">Semua stok aman.</p>}
            <ul className="divide-y divide-stone-100">
              {alerts.data?.lowStock.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-stone-500">
                      Sisa {formatNumber(s.stock)} {s.unit}
                      {s.daysLeft !== null && ` · ± ${s.daysLeft} hari lagi`} · {STATION_LABEL[s.station]}
                    </p>
                  </div>
                  <Badge tone={s.status === 'habis' ? 'red' : 'amber'}>{s.status === 'habis' ? 'Habis' : 'Menipis'}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-stone-50 p-2 text-xs text-stone-500">
              <Sparkles className="size-4 shrink-0" />
              Perkiraan “hari lagi” dihitung dari rata-rata pemakaian 7 hari. Data pergerakan stok sudah disiapkan untuk fitur prediksi AI berikutnya.
            </p>
          </Card>
          <Card
            title={
              <span className="flex items-center gap-2">
                <ClipboardList className="size-5" /> Selisih opname 7 hari
              </span>
            }
          >
            {alerts.data && !alerts.data.opnameVariances.length && <p className="text-sm text-stone-500">Tidak ada selisih.</p>}
            <ul className="divide-y divide-stone-100">
              {alerts.data?.opnameVariances.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 py-2 text-sm">
                  <span>
                    {formatDateLabel(o.businessDate)} · {STATION_LABEL[o.station as keyof typeof STATION_LABEL]} · {o.userName}
                  </span>
                  <span className={o.diffValue < 0 ? 'font-semibold text-red-700' : 'font-semibold text-emerald-700'}>{formatRupiah(o.diffValue)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
