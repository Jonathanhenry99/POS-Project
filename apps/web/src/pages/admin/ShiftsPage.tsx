import { useState } from 'react';
import { formatDateTime, formatNumber, PAYMENT_LABEL, PAYMENT_METHODS, type Shift } from '@mourden/shared';
import { Badge, Card, Empty, ErrorNote, Spinner, cx } from '../../components/ui';
import { PageHeader } from './AdminRoutes';
import { addDays, storeTimezone, today, useApi } from './hooks';
import { DateRangeBar } from './ReportsPage';

export function ShiftsPage() {
  const [range, setRange] = useState({ from: addDays(today(), -6), to: today() });
  const { data, error, loading } = useApi<Shift[]>(`/shifts?from=${range.from}&to=${range.to}`);
  const tz = storeTimezone();
  return (
    <div className="p-4">
      <PageHeader title="Tutup kasir" subtitle="Rekap kas per shift dan selisihnya" />
      <DateRangeBar value={range} onChange={setRange} />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !data.length && <Empty title="Belum ada shift di rentang ini" />}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((s) => {
          const diff = s.countedCash !== null && s.summary ? s.countedCash - s.summary.expectedCash : null;
          return (
            <Card
              key={s.id}
              title={`${formatDateTime(s.openedAt, tz)} · ${s.openedByName}`}
              action={
                s.closedAt ? (
                  diff === 0 ? (
                    <Badge tone="green">Pas</Badge>
                  ) : (
                    <Badge tone="red">Selisih {formatNumber(diff ?? 0)}</Badge>
                  )
                ) : (
                  <Badge tone="blue">Masih buka</Badge>
                )
              }
            >
              {s.summary ? (
                <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-stone-500">Transaksi</dt>
                  <dd className="text-right">{s.summary.orderCount}</dd>
                  <dt className="text-stone-500">Penjualan bersih</dt>
                  <dd className="text-right font-semibold">{formatNumber(s.summary.netSales)}</dd>
                  {PAYMENT_METHODS.map((m) => (
                    <div key={m} className="contents">
                      <dt className="text-stone-500">{PAYMENT_LABEL[m]}</dt>
                      <dd className="text-right">{formatNumber(s.summary!.byMethod[m])}</dd>
                    </div>
                  ))}
                  <dt className="text-stone-500">Modal awal</dt>
                  <dd className="text-right">{formatNumber(s.openingCash)}</dd>
                  <dt className="text-stone-500">Kas seharusnya</dt>
                  <dd className="text-right">{formatNumber(s.summary.expectedCash)}</dd>
                  <dt className="text-stone-500">Kas dihitung</dt>
                  <dd className={cx('text-right font-semibold', diff ? 'text-red-700' : 'text-emerald-700')}>{formatNumber(s.countedCash ?? 0)}</dd>
                </dl>
              ) : (
                <p className="text-sm text-stone-500">Rekap muncul setelah kasir ditutup.</p>
              )}
              {s.cashMovements.length > 0 && (
                <ul className="mt-3 border-t border-stone-100 pt-2 text-sm">
                  {s.cashMovements.map((m) => (
                    <li key={m.id} className="flex justify-between">
                      <span>
                        {m.type === 'in' ? 'Masuk' : 'Keluar'}: {m.note}
                      </span>
                      <span className="tabular">{formatNumber(m.type === 'in' ? m.amount : -m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.closingNote && <p className="mt-2 text-sm text-stone-600">Catatan: {s.closingNote}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
