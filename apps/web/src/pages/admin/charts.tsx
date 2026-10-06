// Grafik ringan tanpa library (bundle kecil untuk tablet 4GB), SVG/CSS saja.
// Aturan: satu seri = tanpa legenda (judul kartu menamai seri); komposisi pakai bar proporsi + tabel,
// warna kategori urutan tetap (chart-1..3), teks memakai warna teks (bukan warna seri).
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatNumber } from '@mourden/shared';
import { cx } from '../../components/ui';

/** Angka yang naik dari 0 saat muncul (dimatikan bila pengguna memilih kurangi gerakan). */
export function useCountUp(value: number, ms = 650) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** Perubahan dibanding periode sebelumnya. */
export function Delta({ now, prev, invert }: { now: number; prev: number | undefined; invert?: boolean }) {
  if (prev === undefined) return null;
  if (prev === 0) return now > 0 ? <span className="rounded-lg bg-primary/12 px-2 py-0.5 text-xs font-bold text-primary">Baru</span> : null;
  const pct = Math.round(((now - prev) / Math.abs(prev)) * 100);
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-xs font-bold tabular', pct === 0 ? 'bg-surface-3 text-fg-muted' : good ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger')}>
      {pct !== 0 && (up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />)}
      {up && pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 26}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cx('h-8 w-full', className)} aria-hidden>
      <polyline points={`0,32 ${pts} 100,32`} fill="var(--primary)" opacity="0.10" />
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Kartu KPI bergaya ESB: latar biru muda, angka besar, badge perubahan. */
export function KpiTile({
  label,
  value,
  format = formatNumber,
  prev,
  invert,
  hint,
  spark,
  icon,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  prev?: number;
  invert?: boolean;
  hint?: ReactNode;
  spark?: number[];
  icon?: ReactNode;
}) {
  const shown = useCountUp(value);
  return (
    <div className="animate-rise flex flex-col rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.07] to-primary/[0.02] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
          {icon}
          {label}
        </p>
        <Delta now={value} prev={prev} invert={invert} />
      </div>
      <p className="mt-1 text-xl leading-tight font-extrabold tracking-tight whitespace-nowrap tabular md:text-[26px]">{format(shown)}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
      {spark && <Sparkline values={spark} className="mt-2" />}
    </div>
  );
}

/** Format sumbu ringkas: 1.250.000 -> 1,3 jt; 25.000 -> 25 rb. */
export function shortNumber(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',')} jt`;
  if (a >= 1_000) return `${Math.round(n / 1_000)} rb`;
  return String(n);
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => n <= s) ?? 10) * pow;
}

/** Grafik area satu seri dengan garis bantu, sumbu Y, dan tooltip (sentuh/arahkan). */
export function AreaChart({ data, format = formatNumber, height = 220 }: { data: { label: string; value: number; detail?: string }[]; format?: (n: number) => string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (!data.length) return <EmptyChart />;
  const W = 640;
  const H = height;
  const padL = 52;
  const padB = 26;
  const padT = 10;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const x = (i: number) => padL + (data.length === 1 ? (W - padL) / 2 : (i / (data.length - 1)) * (W - padL - 8));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const labelEvery = Math.ceil(data.length / 7);
  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    data.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setActive(best);
  };
  const a = active !== null ? data[active] : null;
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        style={{ height }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label="Grafik penjualan"
      >
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--fg-subtle)">
              {shortNumber(t)}
            </text>
          </g>
        ))}
        <polygon points={`${x(0)},${y(0)} ${line} ${x(data.length - 1)},${y(0)}`} fill="url(#area-fill)" className="animate-fade-in" />
        <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.label} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">
              {d.label}
            </text>
          ) : null,
        )}
        {a && active !== null && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={padT} y2={y(0)} stroke="var(--primary)" strokeOpacity="0.35" />
            <circle cx={x(active)} cy={y(a.value)} r="5.5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {a && active !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-card"
          style={{ left: `${Math.min(88, Math.max(12, (x(active) / W) * 100))}%` }}
        >
          <p className="text-xs text-fg-muted">{a.label}</p>
          <p className="font-bold tabular">{format(a.value)}</p>
          {a.detail && <p className="text-xs text-fg-muted">{a.detail}</p>}
        </div>
      )}
    </div>
  );
}

/** Batang vertikal satu seri dengan sumbu Y ringkas dan tooltip. */
export function ColumnChart({ data, format = formatNumber, height = 180 }: { data: { label: string; value: number; detail?: string }[]; format?: (n: number) => string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  if (!data.length || data.every((d) => d.value === 0)) return <EmptyChart />;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const labelEvery = Math.ceil(data.length / 12);
  const a = active !== null ? data[active] : null;
  return (
    <div>
      <p className="mb-2 h-5 text-sm text-fg-muted">
        {a ? (
          <>
            <b className="text-fg">{a.label}</b> · {format(a.value)}
            {a.detail && ` · ${a.detail}`}
          </>
        ) : (
          'Sentuh batang untuk melihat nilai'
        )}
      </p>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-right text-[11px] text-fg-subtle tabular" style={{ height }}>
          <span>{shortNumber(max)}</span>
          <span>{shortNumber(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ top: height / 2 }} />
          <div className="flex items-end gap-1 border-b border-line-strong" style={{ height }} onPointerLeave={() => setActive(null)}>
            {data.map((d, i) => (
              <button
                key={d.label}
                aria-label={`${d.label}: ${format(d.value)}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className="flex h-full min-w-0 flex-1 items-end justify-center"
              >
                <span
                  className={cx('w-full max-w-12 rounded-t-[4px] transition-colors', active === i ? 'bg-primary-strong' : 'bg-primary/75')}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0, animation: `rise 420ms ${i * 25}ms cubic-bezier(.2,.8,.2,1) both` }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {data.map((d, i) => (
              <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-fg-subtle">
                {i % labelEvery === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

/** Komposisi (pengganti pie): bar proporsi + tabel Porsi & Persentase. Maksimal 3 warna; lebih dari itu bar per baris. */
export function Composition({
  rows,
  format = formatNumber,
  unitLabel = 'Porsi',
  emptyText,
}: {
  rows: { label: string; value: number; detail?: string }[];
  format?: (n: number) => string;
  unitLabel?: string;
  emptyText: string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <EmptyChart text={emptyText} />;
  const colored = rows.length <= 3;
  return (
    <div className="flex flex-col gap-4">
      {colored && (
        <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">
          {rows.map((r, i) => (
            <span
              key={r.label}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(r.value / total) * 100}%`, background: SERIES[i], animation: `slide-in 500ms ${i * 80}ms both` }}
            />
          ))}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary/6 text-left text-fg-muted">
            <th className="rounded-l-xl px-3 py-2 font-semibold">Nama</th>
            <th className="px-3 py-2 text-right font-semibold">{unitLabel}</th>
            <th className="rounded-r-xl px-3 py-2 text-right font-semibold">Persentase</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pct = (r.value / total) * 100;
            return (
              <tr key={r.label} className="border-b border-line last:border-0">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 font-medium">
                    {colored && <span className="size-3 shrink-0 rounded-[4px]" style={{ background: SERIES[i] }} />}
                    {r.label}
                  </span>
                  {!colored && (
                    <span className="mt-1 block h-1.5 rounded-full bg-surface-3">
                      <span className="block h-1.5 rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular">
                  {format(r.value)}
                  {r.detail && <span className="block text-xs text-fg-subtle">{r.detail}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular">{pct.toFixed(1).replace('.', ',')}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** Peta keramaian hari x jam (sequential satu warna: makin pekat makin ramai). */
export function Heatmap({ cells }: { cells: { dow: number; hour: number; count: number; amount: number }[] }) {
  const [active, setActive] = useState<(typeof cells)[number] | null>(null);
  if (!cells.length) return <EmptyChart />;
  const hours = cells.map((c) => c.hour);
  const from = Math.min(...hours);
  const to = Math.max(...hours);
  const max = Math.max(...cells.map((c) => c.count));
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h);
  return (
    <div>
      <p className="mb-2 h-5 text-sm text-fg-muted">
        {active ? (
          <>
            <b className="text-fg">
              {DAYS[active.dow - 1]} {String(active.hour).padStart(2, '0')}:00
            </b>{' '}
            · {active.count} transaksi · {formatNumber(active.amount)}
          </>
        ) : (
          'Makin pekat = makin ramai. Sentuh kotak untuk detail.'
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[10px] text-fg-subtle">
          <tbody>
            {DAYS.map((d, di) => (
              <tr key={d}>
                <td className="pr-1 font-semibold">{d}</td>
                {Array.from({ length: to - from + 1 }, (_, k) => {
                  const c = get(di + 1, from + k);
                  return (
                    <td key={k} className="p-0">
                      <button
                        aria-label={`${d} ${from + k}:00 ${c?.count ?? 0} transaksi`}
                        onPointerEnter={() => c && setActive(c)}
                        onClick={() => c && setActive(c)}
                        className="block size-7 rounded-md transition-transform hover:scale-110"
                        style={{ background: c ? `color-mix(in oklab, var(--primary) ${15 + (c.count / max) * 85}%, white)` : 'var(--surface-2)' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td />
              {Array.from({ length: to - from + 1 }, (_, k) => (
                <td key={k} className="text-center">
                  {String(from + k).padStart(2, '0')}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyChart({ text = 'Belum ada data penjualan di periode ini.' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-fg-subtle">
      <svg viewBox="0 0 64 40" className="h-10 w-16 text-line-strong" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M2 38h60M8 30l12-10 10 6 14-14 12 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </div>
  );
}
