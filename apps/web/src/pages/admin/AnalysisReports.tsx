// Laporan analitik: Analisa Menu (popularitas x margin) dan Kinerja Kasir.
import { AlertTriangle, Gem, HelpCircle, Star, TrendingDown, Truck } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { QUADRANT_ADVICE, QUADRANT_LABEL, formatNumber, formatRupiah, type MenuAnalysis, type MenuAnalysisRow, type MenuQuadrant } from '@mourden/shared';
import { Card, Empty, ErrorNote, Skeleton, cx } from '../../components/ui';
import { EmptyChart, niceMax, shortNumber } from './charts';
import { useApi } from './hooks';
import type { Range, Summary } from './reportData';

const QUADRANTS: MenuQuadrant[] = ['star', 'plowhorse', 'puzzle', 'dog'];
const QUADRANT_STYLE: Record<MenuQuadrant, { badge: string; icon: ReactNode }> = {
  star: { badge: 'bg-[var(--lime)] text-[var(--lime-ink)]', icon: <Star className="size-[18px]" /> },
  plowhorse: { badge: 'bg-accent/15 text-[#8f3d05]', icon: <Truck className="size-[18px]" /> },
  puzzle: { badge: 'bg-[var(--violet-soft)] text-[#5237b8]', icon: <Gem className="size-[18px]" /> },
  dog: { badge: 'bg-surface-3 text-fg-muted', icon: <TrendingDown className="size-[18px]" /> },
};

export function QuadrantBadge({ q }: { q: MenuQuadrant }) {
  return <span className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap', QUADRANT_STYLE[q].badge)}>{QUADRANT_LABEL[q]}</span>;
}

export function MenuMatrixReport({ range }: { range: Range }) {
  const { data, error } = useApi<MenuAnalysis>(`/reports/menu-matrix?from=${range.from}&to=${range.to}`);
  const [filter, setFilter] = useState<MenuQuadrant | 'all'>('all');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Skeleton className="h-96" />;
  if (!data.rows.length) return <Empty title="Belum ada menu aktif" />;
  const revenue = data.rows.reduce((n, r) => n + r.amount, 0);
  const rows = data.rows.filter((r) => filter === 'all' || r.quadrant === filter);
  return (
    <div className="flex flex-col gap-4">
      {data.missingCost > 0 && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#8a5a00]" />
          <span>
            <b>{data.missingCost} menu belum punya resep/HPP</b>, jadi marginnya dianggap sama dengan harga jual dan posisi di matriks belum akurat.{' '}
            <Link to="/admin/resep" className="font-semibold underline">
              Isi Resep & HPP
            </Link>
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {QUADRANTS.map((q) => {
          const list = data.rows.filter((r) => r.quadrant === q);
          const amount = list.reduce((n, r) => n + r.amount, 0);
          return (
            <button key={q} onClick={() => setFilter(filter === q ? 'all' : q)} aria-pressed={filter === q} className={cx('tile press flex flex-col p-4 text-left outline-2', filter === q ? 'outline-fg' : 'outline-transparent hover:outline-line-strong')}>
              <span className="flex items-center justify-between">
                <QuadrantBadge q={q} />
                <span className="icon-chip">{QUADRANT_STYLE[q].icon}</span>
              </span>
              <span className="mt-3 text-[28px] leading-none font-semibold tracking-tight tabular">
                {list.length} <span className="text-sm font-medium text-fg-muted">menu</span>
              </span>
              <span className="mt-1 text-xs text-fg-muted tabular">{revenue ? Math.round((amount / revenue) * 100) : 0}% penjualan</span>
              <span className="mt-2 text-xs leading-snug text-fg-muted">{QUADRANT_ADVICE[q]}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="Matriks menu" icon={<HelpCircle className="size-4" />}>
          <p className="mb-2 text-sm text-fg-muted">
            Kanan = makin laris, atas = makin besar untung per porsi. Garis putus-putus: batas laris ({String(data.popularityThresholdPct).replace('.', ',')}% dari item terjual) dan margin rata-rata ({formatRupiah(data.marginThreshold)}).
          </p>
          <MatrixPlot data={data} />
        </Card>

        <Card
          title="Rincian per menu"
          action={
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {(['all', ...QUADRANTS] as const).map((q) => (
                <button key={q} className="pill h-9 px-3 text-[13px]" aria-pressed={filter === q} onClick={() => setFilter(q)}>
                  {q === 'all' ? 'Semua' : QUADRANT_LABEL[q]}
                </button>
              ))}
            </div>
          }
        >
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-2 text-left text-fg-muted">
                  <th className="rounded-l-xl px-3 py-2">Menu</th>
                  <th className="px-3 py-2 text-right">Terjual</th>
                  <th className="px-3 py-2 text-right">HPP</th>
                  <th className="px-3 py-2 text-right">Margin/porsi</th>
                  <th className="px-3 py-2 text-right">Total margin</th>
                  <th className="rounded-r-xl px-3 py-2 text-right">Kelompok</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{r.name}</span>
                      <span className="block text-xs text-fg-subtle">
                        {r.category} · {formatNumber(r.unitPrice)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {formatNumber(r.qty)}
                      <span className="block text-xs text-fg-subtle">{String(r.mixPct).replace('.', ',')}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{r.hasCost ? formatNumber(Math.round(r.cost)) : <span className="text-xs font-semibold text-[#8a5a00]">belum diisi</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {formatNumber(r.unitMargin)}
                      <span className="block text-xs text-fg-subtle">{String(r.marginPct).replace('.', ',')}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular">{formatNumber(r.totalMargin)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <QuadrantBadge q={r.quadrant} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="py-8 text-center text-sm text-fg-subtle">Tidak ada menu di kelompok ini.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Diagram sebar: porsi penjualan (x) vs margin per porsi (y), dibagi empat oleh dua ambang. */
function MatrixPlot({ data }: { data: MenuAnalysis }) {
  const [active, setActive] = useState<MenuAnalysisRow | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (!data.totalQty) return <EmptyChart text="Belum ada penjualan di periode ini, jadi popularitas belum bisa dihitung." />;
  const W = 640;
  const H = 440;
  const pad = { l: 54, r: 16, t: 18, b: 40 };
  const maxX = Math.max(data.popularityThresholdPct * 1.6, ...data.rows.map((r) => r.mixPct)) * 1.1;
  const maxY = niceMax(Math.max(data.marginThreshold * 1.4, ...data.rows.map((r) => r.unitMargin)));
  const minY = Math.min(0, ...data.rows.map((r) => r.unitMargin));
  const x = (v: number) => pad.l + (v / maxX) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * (H - pad.t - pad.b);
  const tx = x(data.popularityThresholdPct);
  const ty = y(data.marginThreshold);
  // Label langsung hanya untuk beberapa menu teratas, dan hanya bila tidak menimpa titik atau label lain.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = data.rows.map((r) => ({ x0: x(r.mixPct) - 8, x1: x(r.mixPct) + 8, y0: y(r.unitMargin) - 8, y1: y(r.unitMargin) + 8 }));
  const labels = new Map<string, { lx: number; ly: number; text: string }>();
  for (const r of [...data.rows].sort((a, b) => b.totalMargin - a.totalMargin).slice(0, 6)) {
    const text = r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name;
    const w = text.length * 6.6;
    const cx0 = Math.min(W - pad.r - w / 2, Math.max(pad.l + w / 2, x(r.mixPct)));
    for (const ly of [y(r.unitMargin) - 14, y(r.unitMargin) + 24]) {
      const box = { x0: cx0 - w / 2 - 2, x1: cx0 + w / 2 + 2, y0: ly - 12, y1: ly + 3 };
      if (box.y0 < pad.t || box.y1 > H - pad.b) continue;
      if (placed.some((p) => p.x0 < box.x1 && p.x1 > box.x0 && p.y0 < box.y1 && p.y1 > box.y0)) continue;
      placed.push(box);
      labels.set(r.productId, { lx: cx0, ly, text });
      break;
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    let best: MenuAnalysisRow | null = null;
    let dist = 32 ** 2;
    for (const r of data.rows) {
      const d = (x(r.mixPct) - px) ** 2 + (y(r.unitMargin) - py) ** 2;
      if (d < dist) {
        dist = d;
        best = r;
      }
    }
    setActive(best);
  };
  const corner = 'fill-[var(--fg-subtle)] text-[11px] font-semibold uppercase tracking-wider';
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} role="img" aria-label="Matriks menu: popularitas terhadap margin per porsi">
        <rect x={tx} y={pad.t} width={W - pad.r - tx} height={ty - pad.t} fill="var(--lime)" opacity="0.22" rx="10" />
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(minY + (maxY - minY) * t)} y2={y(minY + (maxY - minY) * t)} stroke="var(--line)" />
            <text x={pad.l - 8} y={y(minY + (maxY - minY) * t) + 4} textAnchor="end" fontSize="11" fill="var(--fg-subtle)">
              {shortNumber(Math.round(minY + (maxY - minY) * t))}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={x(maxX * t)} y={H - pad.b + 16} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'} fontSize="11" fill="var(--fg-subtle)">
            {(maxX * t).toFixed(0)}%
          </text>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">
          Porsi dari item terjual
        </text>
        <line x1={tx} x2={tx} y1={pad.t} y2={H - pad.b} stroke="var(--line-strong)" strokeDasharray="5 5" />
        <line x1={pad.l} x2={W - pad.r} y1={ty} y2={ty} stroke="var(--line-strong)" strokeDasharray="5 5" />
        <text x={W - pad.r - 8} y={pad.t + 16} textAnchor="end" className={corner}>{QUADRANT_LABEL.star}</text>
        <text x={W - pad.r - 8} y={H - pad.b - 8} textAnchor="end" className={corner}>{QUADRANT_LABEL.plowhorse}</text>
        <text x={pad.l + 8} y={pad.t + 16} className={corner}>{QUADRANT_LABEL.puzzle}</text>
        <text x={pad.l + 8} y={H - pad.b - 8} className={corner}>{QUADRANT_LABEL.dog}</text>
        {data.rows.map((r) => (
          <g key={r.productId}>
            <circle cx={x(r.mixPct)} cy={y(r.unitMargin)} r={active?.productId === r.productId ? 8 : 6} fill="var(--chart-2)" stroke="#fff" strokeWidth="2" />
            {labels.has(r.productId) && (
              <text x={labels.get(r.productId)!.lx} y={labels.get(r.productId)!.ly} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--fg)" stroke="#fff" strokeWidth="3" paintOrder="stroke">
                {labels.get(r.productId)!.text}
              </text>
            )}
          </g>
        ))}
      </svg>
      {active && (
        <div
          className="tile pointer-events-none absolute z-10 px-3 py-2 text-sm whitespace-nowrap ring-1 ring-line"
          style={{ left: `${(x(active.mixPct) / W) * 100}%`, top: `${(y(active.unitMargin) / H) * 100}%`, transform: `translate(-${Math.min(85, Math.max(15, (x(active.mixPct) / W) * 100))}%, calc(-100% - 12px))`, borderRadius: 14 }}
        >
          <p className="font-semibold">{active.name}</p>
          <p className="text-xs text-fg-muted tabular">
            {formatNumber(active.qty)} terjual ({String(active.mixPct).replace('.', ',')}%) · margin {formatNumber(active.unitMargin)}/porsi
          </p>
          <p className="mt-1">
            <QuadrantBadge q={active.quadrant} />
          </p>
        </div>
      )}
    </div>
  );
}

export function CashierReport({ s }: { s: Summary }) {
  const total = s.byCashier.reduce((n, c) => n + c.amount, 0);
  if (!s.byCashier.length) return <Empty title="Belum ada transaksi di periode ini" />;
  return (
    <Card title="Kinerja Kasir">
      <p className="mb-3 text-sm text-fg-muted">Penjualan, rata-rata bill, diskon yang diberikan dan pembatalan per kasir. Void tinggi atau diskon besar pada satu kasir layak ditinjau di Detail Penjualan.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-fg-muted">
              <th className="rounded-l-xl px-3 py-2">Kasir</th>
              <th className="px-3 py-2 text-right">Bill</th>
              <th className="px-3 py-2 text-right">Penjualan</th>
              <th className="px-3 py-2 text-right">Rata-rata bill</th>
              <th className="px-3 py-2 text-right">Diskon</th>
              <th className="px-3 py-2 text-right">Void</th>
              <th className="rounded-r-xl px-3 py-2">Porsi penjualan</th>
            </tr>
          </thead>
          <tbody>
            {s.byCashier.map((c) => {
              const share = total ? (c.amount / total) * 100 : 0;
              return (
                <tr key={c.name} className="border-b border-line last:border-0">
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2.5 font-semibold">
                      <span className="sidebar-avatar">{c.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular">{formatNumber(c.count)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular">{formatNumber(c.amount)}</td>
                  <td className="px-3 py-3 text-right tabular">{formatNumber(c.count ? Math.round(c.amount / c.count) : 0)}</td>
                  <td className="px-3 py-3 text-right tabular">{formatNumber(c.discountAmount)}</td>
                  <td className={cx('px-3 py-3 text-right tabular', c.voidCount > 0 && 'font-semibold text-danger')}>{c.voidCount}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-28 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-[var(--chart-3)]" style={{ width: `${share}%` }} />
                      </span>
                      <span className="tabular">{Math.round(share)}%</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
