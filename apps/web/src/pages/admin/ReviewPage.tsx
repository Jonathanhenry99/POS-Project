// Perlu Ditinjau: aktivitas kasir yang berisiko (hapus pesanan setelah tagihan, void, diskon besar, selisih kas, dst).
import { AlertOctagon, AlertTriangle, Check, Info, RotateCcw, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CASH_DIFF_FLAG, DISCOUNT_FLAG_PCT, REVIEW_KIND_LABEL, formatDateTime, formatNumber, type ReviewItem, type ReviewKind, type ReviewSeverity } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Button, Empty, ErrorNote, Skeleton, Toggle, cx } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { addDays, storeTimezone, today, useApi } from './hooks';
import { DateRangeBar } from './ReportsPage';
import type { Range } from './reportData';

export interface ReviewData {
  items: ReviewItem[];
  open: number;
  high: number;
}

const SEVERITY: Record<ReviewSeverity, { label: string; className: string; icon: ReactNode }> = {
  high: { label: 'Risiko tinggi', className: 'bg-danger/12 text-danger', icon: <AlertOctagon className="size-3.5" /> },
  medium: { label: 'Sedang', className: 'bg-warning/15 text-[#8a5a00]', icon: <AlertTriangle className="size-3.5" /> },
  low: { label: 'Rendah', className: 'bg-surface-3 text-fg-muted', icon: <Info className="size-3.5" /> },
};

export function ReviewPage() {
  const [range, setRange] = useState<Range>(() => ({ from: addDays(today(), -6), to: today() }));
  const { data, error, setData } = useApi<ReviewData>(`/reports/review?from=${range.from}&to=${range.to}`);
  const [kind, setKind] = useState<ReviewKind | 'all'>('all');
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const tz = storeTimezone();

  const items = data?.items ?? [];
  const kinds = useMemo(() => [...new Set(items.map((i) => i.kind))], [items]);
  const visible = items.filter((i) => (kind === 'all' || i.kind === kind) && (showDone || !i.reviewed));
  const byActor = useMemo(() => {
    const m = new Map<string, { open: number; high: number }>();
    for (const i of items) {
      if (i.reviewed) continue;
      const a = m.get(i.actor || 'Tidak diketahui') ?? { open: 0, high: 0 };
      a.open++;
      if (i.severity === 'high') a.high++;
      m.set(i.actor || 'Tidak diketahui', a);
    }
    return [...m.entries()].sort((a, b) => b[1].high - a[1].high || b[1].open - a[1].open);
  }, [items]);

  const mark = async (keys: string[], reviewed: boolean) => {
    if (!keys.length || !data) return;
    setBusy(true);
    try {
      await api('/reports/review/mark', { method: 'POST', body: { keys, reviewed } });
      const set = new Set(keys);
      const next = data.items.map((i) => (set.has(i.key) ? { ...i, reviewed } : i));
      const open = next.filter((i) => !i.reviewed);
      setData({ items: next, open: open.length, high: open.filter((i) => i.severity === 'high').length });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Perlu Ditinjau" subtitle="Aktivitas kasir yang berisiko. Tinjau, tanyakan ke kasir bila perlu, lalu tandai selesai." />
      <DateRangeBar value={range} onChange={setRange} />
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        !error && <Skeleton className="h-72" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Belum ditinjau" value={data.open} tone={data.open ? 'text-fg' : 'text-success'} />
            <Tile label="Risiko tinggi" value={data.high} tone={data.high ? 'text-danger' : 'text-success'} />
            {byActor.slice(0, 2).map(([name, c]) => (
              <Tile key={name} label={name} value={c.open} hint={c.high ? `${c.high} risiko tinggi` : 'tanpa risiko tinggi'} tone="text-fg" />
            ))}
          </div>

          <section className="tile p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="no-scrollbar flex gap-1 overflow-x-auto">
                {(['all', ...kinds] as const).map((k) => (
                  <button key={k} className="pill h-9 px-3 text-[13px]" aria-pressed={kind === k} onClick={() => setKind(k)}>
                    {k === 'all' ? 'Semua' : REVIEW_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-72">
                  <Toggle checked={showDone} onChange={setShowDone} label="Tampilkan yang sudah ditinjau" />
                </div>
                <Button size="sm" variant="outline" icon={<Check className="size-4" />} loading={busy} disabled={!visible.some((i) => !i.reviewed)} onClick={() => void mark(visible.filter((i) => !i.reviewed).map((i) => i.key), true)}>
                  Tandai semua
                </Button>
              </div>
            </div>

            {!visible.length ? (
              <Empty icon={<ShieldCheck className="size-8 text-success" />} title={items.length ? 'Semua sudah ditinjau' : 'Tidak ada yang perlu ditinjau'}>
                {items.length ? 'Aktifkan “Tampilkan yang sudah ditinjau” untuk melihat kembali.' : 'Tidak ada aktivitas berisiko di rentang tanggal ini.'}
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((i) => (
                  <li key={i.key} className={cx('tile-soft flex flex-wrap items-start gap-3 p-3.5', i.reviewed && 'opacity-60')}>
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', SEVERITY[i.severity].className)}>
                          {SEVERITY[i.severity].icon} {SEVERITY[i.severity].label}
                        </span>
                        <span className="text-xs font-semibold text-fg-muted">{REVIEW_KIND_LABEL[i.kind]}</span>
                      </p>
                      <p className="mt-1.5 font-semibold">{i.title}</p>
                      <p className="text-sm text-fg-muted">{i.detail}</p>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {i.actor || 'Tidak diketahui'} · {formatDateTime(i.at, tz)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {i.amount !== 0 && <p className="text-lg font-semibold tabular">{formatNumber(i.amount)}</p>}
                      {i.reviewed ? (
                        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} disabled={busy} onClick={() => void mark([i.key], false)}>
                          Batalkan
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" icon={<Check className="size-4" />} disabled={busy} onClick={() => void mark([i.key], true)}>
                          Sudah ditinjau
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tile p-4 text-sm text-fg-muted">
            <p className="mb-2 font-semibold text-fg">Apa saja yang masuk daftar ini?</p>
            <ul className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
              <li>Pesanan dihapus atau item dikurangi <b>setelah tagihan dicetak</b></li>
              <li>Tagihan pesanan yang sama dicetak lebih dari sekali</li>
              <li>Semua void (tunai tanpa PIN owner = risiko tinggi)</li>
              <li>Diskon mulai {DISCOUNT_FLAG_PCT}% dari subtotal</li>
              <li>Menu berharga Rp 0 yang terjual (komplimen)</li>
              <li>Laci uang dibuka tanpa transaksi</li>
              <li>Selisih kas tutup shift mulai Rp {formatNumber(CASH_DIFF_FLAG)}</li>
              <li>Pesanan tersimpan yang dibatalkan (risiko rendah)</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone: string }) {
  return (
    <div className="tile p-4">
      <p className="truncate text-sm font-medium text-fg-muted">{label}</p>
      <p className={cx('mt-1 text-[30px] leading-none font-semibold tracking-tight tabular', tone)}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
