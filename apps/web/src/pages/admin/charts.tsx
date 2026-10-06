// Grafik ringan tanpa library (bundle kecil untuk tablet 4GB). Satu seri per grafik: tanpa legenda,
// judul kartu yang menamai seri. Ketuk/arahkan ke batang untuk melihat nilainya.
import { useState } from 'react';
import { formatNumber } from '@mourden/shared';
import { cx } from '../../components/ui';

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

/** Batang vertikal (mis. penjualan per jam/hari). */
export function ColumnChart({ data, format = formatNumber, height = 160 }: { data: { label: string; value: number; detail?: string }[]; format?: (n: number) => string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const shown = active ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  if (!data.length) return <p className="py-6 text-center text-sm text-stone-500">Belum ada data.</p>;
  const labelEvery = Math.ceil(data.length / 12);
  return (
    <div>
      <p className="mb-2 h-5 text-sm text-stone-600">
        {data[shown] && (
          <>
            <b className="text-stone-900">{data[shown].label}</b> · {format(data[shown].value)}
            {data[shown].detail && ` · ${data[shown].detail}`}
          </>
        )}
      </p>
      <div className="flex items-end gap-0.5 border-b border-stone-300" style={{ height }} onPointerLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <button
            key={d.label}
            aria-label={`${d.label}: ${format(d.value)}`}
            onPointerEnter={() => setActive(i)}
            onClick={() => setActive(i)}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={cx('w-full rounded-t-[4px] transition-colors', shown === i ? 'bg-brand-800' : 'bg-brand-400')}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {data.map((d, i) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-stone-500">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Batang horizontal berlabel (mis. produk terlaris, metode bayar). */
export function BarList({ data, format = formatNumber }: { data: { label: string; value: number; detail?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-sm text-stone-500">Belum ada data.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate font-medium text-stone-800">{d.label}</span>
            <span className="shrink-0 text-stone-600 tabular">
              {format(d.value)}
              {d.detail && <span className="text-stone-400"> · {d.detail}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-stone-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
