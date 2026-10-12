// Komponen dashboard tema "Pulse": kartu KPI, batang arsir dengan satu sorotan, tren area, cincin capaian.
// Tetap tanpa library grafik. Satu seri per grafik (judul kartu menamai serinya), tooltip saat disentuh/diarahkan.
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatNumber } from '@mourden/shared';
import { cx } from '../../components/ui';
import { EmptyChart, niceMax, shortNumber, useCountUp } from './charts';

/** Persen perubahan satu desimal ala Indonesia: +3,1%. null bila pembanding tidak ada. */
export function changePct(now: number, prev: number | undefined): number | null {
  if (prev === undefined || prev === 0) return null;
  return Math.round(((now - prev) / Math.abs(prev)) * 1000) / 10;
}

const pctText = (pct: number) => `${pct > 0 ? '+' : ''}${String(pct).replace('.', ',')}%`;

/** Perubahan sebagai teks kecil berpanah (hijau naik, merah turun; `invert` untuk metrik yang lebih baik bila turun). */
export function DeltaText({ now, prev, invert, label }: { now: number; prev: number | undefined; invert?: boolean; label?: string }) {
  if (prev === undefined) return <span className="text-fg-subtle">{label}</span>;
  const pct = changePct(now, prev);
  if (pct === null) return <span className="text-fg-subtle">{now > 0 ? 'Baru di periode ini' : 'Belum ada data'}</span>;
  const good = pct === 0 ? null : invert ? pct < 0 : pct > 0;
  return (
    <span className="flex items-center gap-1.5 text-fg-muted">
      <span className={cx('flex items-center gap-0.5 font-semibold tabular', good === null ? 'text-fg-muted' : good ? 'text-success' : 'text-danger')}>
        {pct !== 0 && (pct > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />)}
        {pctText(pct)}
      </span>
      {label}
    </span>
  );
}

/** Pil perubahan untuk angka utama (lime bila membaik). */
export function DeltaPill({ now, prev, invert }: { now: number; prev: number | undefined; invert?: boolean }) {
  const pct = changePct(now, prev);
  if (pct === null) return null;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-bold tabular', good ? 'bg-[var(--lime)] text-[var(--lime-ink)]' : 'bg-danger/12 text-danger')}>
      {pctText(pct)}
      {pct >= 0 ? <ArrowUpRight className="size-3.5" /> : <TrendingDown className="size-3.5" />}
    </span>
  );
}

/** Kartu KPI: label + ikon, angka besar, perubahan vs periode pembanding, tautan detail. */
export function StatCard({
  label,
  value,
  format = formatNumber,
  prev,
  invert,
  compare,
  icon,
  to,
  delay = 0,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  prev?: number;
  invert?: boolean;
  compare: string;
  icon: ReactNode;
  to?: string;
  delay?: number;
}) {
  const shown = useCountUp(value);
  return (
    <section className="tile animate-rise flex min-w-0 flex-col p-4 sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-fg-muted sm:text-[15px]">{label}</p>
        <span className="icon-chip">{icon}</span>
      </div>
      <p className="mt-3 text-[21px] leading-none font-semibold tracking-tight whitespace-nowrap tabular sm:text-[30px] xl:text-[34px]">{format(shown)}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
        <DeltaText now={value} prev={prev} invert={invert} label={compare} />
        {to && (
          <Link to={to} className="flex items-center gap-1 font-medium text-fg-muted hover:text-fg">
            Lihat detail <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}

/** Statistik pendamping yang lebih ringkas (diskon, void, item per bill, tamu). */
export function MiniStat({ label, value, hint, icon }: { label: string; value: string; hint?: ReactNode; icon: ReactNode }) {
  return (
    <div className="tile flex min-w-0 items-center gap-3 px-4 py-3.5">
      <span className="icon-chip">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg-muted">{label}</p>
        <p className="truncate text-lg leading-tight font-semibold tabular">{value}</p>
        {hint && <p className="truncate text-xs text-fg-subtle">{hint}</p>}
      </div>
    </div>
  );
}

export interface Point {
  label: string;
  /** Label sumbu yang lebih pendek (mis. "09" untuk "09:00"); tooltip tetap memakai `label`. */
  axis?: string;
  value: number;
  detail?: string;
}

/**
 * Batang arsir dengan satu batang disorot oranye + kartu nilai di atasnya.
 * Sorotan bawaan = nilai tertinggi; berpindah saat batang lain disentuh/diarahkan.
 */
export function HighlightBars({ data, format = formatNumber, height = 264, valueLabel }: { data: Point[]; format?: (n: number) => string; height?: number; valueLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || data.every((d) => d.value === 0)) return <EmptyChart />;
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const active = hover ?? peak;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const labelEvery = Math.ceil(data.length / 12);
  const a = data[active];
  const left = ((active + 0.5) / data.length) * 100;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between pt-14 text-right text-[11px] text-fg-subtle tabular" style={{ height: height + 56 }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 last:translate-y-0">
            {shortNumber(max * t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative pt-14" onPointerLeave={() => setHover(null)}>
          <div className="pointer-events-none absolute inset-x-0 top-14 bottom-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className={cx('border-t', t === 0 ? 'border-line-strong' : 'border-dashed border-line')} />
            ))}
          </div>
          <div
            className="tile pointer-events-none absolute z-10 px-3 py-2 text-sm whitespace-nowrap ring-1 ring-line transition-[left,bottom] duration-150"
            style={{ left: `${left}%`, bottom: `calc(${(a.value / max) * height}px + 10px)`, transform: `translateX(-${Math.min(85, Math.max(15, left))}%)`, borderRadius: 14 }}
          >
            <p className="text-xs text-fg-muted">{a.label}</p>
            <p className="flex items-center gap-1.5 font-semibold tabular">
              <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-1)' }} />
              {format(a.value)}
            </p>
            {a.detail && <p className="text-xs text-fg-muted">{a.detail}</p>}
          </div>
          <div className="relative flex items-end gap-1.5" style={{ height }} role="img" aria-label={`Grafik ${valueLabel}. Tertinggi ${data[peak].label}: ${format(data[peak].value)}`}>
            {data.map((d, i) => (
              <button
                key={`${d.label}-${i}`}
                aria-label={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ''}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                className="group flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              >
                <span
                  className={cx('relative w-full max-w-14 rounded-[7px] transition-[filter] group-focus-visible:ring-2 group-focus-visible:ring-fg', i !== active && 'bar-hatch group-hover:brightness-95')}
                  style={{
                    height: `${(d.value / max) * 100}%`,
                    minHeight: 4,
                    background: i === active ? 'var(--chart-1)' : undefined,
                    animation: `rise 420ms ${Math.min(i, 20) * 22}ms cubic-bezier(.2,.8,.2,1) both`,
                  }}
                >
                  {i === active && d.value > 0 && <span className="absolute -top-[7px] left-1/2 size-3.5 -translate-x-1/2 rounded-full border-[3px] border-white" style={{ background: 'var(--chart-1)' }} />}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {data.map((d, i) => (
            <span key={`${d.label}-${i}`} className={cx('flex min-w-0 flex-1 justify-center text-[11px] whitespace-nowrap', i === active ? 'font-semibold text-fg' : 'text-fg-subtle')}>
              {/* Label aktif selalu tampil; label tetangganya disembunyikan agar tidak bertumpuk. */}
              {i === active || (i % labelEvery === 0 && Math.abs(i - active) > 1) ? (d.axis ?? d.label) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Garis halus melalui titik (Catmull-Rom -> Bezier) agar tren tidak bersudut tajam. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const k = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Tren area ungu dengan kolom sorot + gelembung nilai (bawaan: titik tertinggi). */
export function TrendArea({ data, format = formatNumber, height = 150 }: { data: Point[]; format?: (n: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (data.length < 2 || data.every((d) => d.value === 0)) return <EmptyChart />;
  const W = 420;
  const H = height;
  const padT = 34;
  const padB = 6;
  const max = Math.max(...data.map((d) => d.value)) * 1.08;
  const x = (i: number) => 6 + (i / (data.length - 1)) * (W - 12);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const pts = data.map((d, i) => [x(i), y(d.value)] as [number, number]);
  const line = smoothPath(pts);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const active = hover ?? peak;
  const a = data[active];
  const labelEvery = Math.ceil(data.length / 7);
  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - 6) / (W - 12)) * (data.length - 1)))));
  };
  const colW = Math.max(14, Math.min(34, ((W - 12) / data.length) * 0.8));
  return (
    <div>
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full touch-none" style={{ height }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Tren. Tertinggi ${data[peak].label}: ${format(data[peak].value)}`}>
          <defs>
            <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${x(data.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#trend-fill)" className="animate-fade-in" />
          <rect x={x(active) - colW / 2} y={pts[active][1]} width={colW} height={H - pts[active][1]} rx="7" fill="var(--chart-2)" opacity="0.28" />
          <path d={line} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${(x(active) / W) * 100}%`, top: pts[active][1], background: 'var(--chart-2)' }} />
        <div
          className="tile pointer-events-none absolute z-10 px-2.5 py-1 text-center text-sm whitespace-nowrap ring-1 ring-line"
          style={{ left: `${(x(active) / W) * 100}%`, top: Math.max(0, pts[active][1] - 44), transform: `translateX(-${Math.min(85, Math.max(15, (x(active) / W) * 100))}%)`, borderRadius: 12 }}
        >
          <span className="font-semibold tabular">{format(a.value)}</span>
          <span className="ml-1.5 text-xs text-fg-muted">{a.label}</span>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-fg-subtle" aria-hidden>
        {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1 ? <span key={`${d.label}-${i}`}>{d.axis ?? d.label}</span> : null))}
      </div>
    </div>
  );
}

/** Cincin capaian 0-100% (nilai di atas 100% tetap penuh; angka di tengah menampilkan persen aslinya). */
export function ProgressRing({ pct, size = 132, label }: { pct: number; size?: number; label: string }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)}%`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[26px] leading-none font-semibold tracking-tight tabular">{Math.round(pct)}%</p>
          <p className="mt-1 text-[11px] text-fg-muted">tercapai</p>
        </div>
      </div>
    </div>
  );
}
