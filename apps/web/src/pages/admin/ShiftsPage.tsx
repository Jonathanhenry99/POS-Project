import { Camera, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime, formatNumber, formatRupiah, type Shift, type ShiftProofInfo } from '@mourden/shared';
import { Reconciliation } from '../../components/Reconciliation';
import { Badge, Empty, ErrorNote, Modal, Spinner, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { addDays, storeTimezone, today, useApi } from './hooks';
import { DateRangeBar } from './ReportsPage';

const PROOF_LABEL: Record<ShiftProofInfo['kind'], string> = { edc: 'Struk settlement EDC', cash: 'Uang tunai' };

export function ShiftsPage() {
  const [range, setRange] = useState({ from: addDays(today(), -6), to: today() });
  const { data, error, loading } = useApi<Shift[]>(`/shifts?from=${range.from}&to=${range.to}`);
  const tz = storeTimezone();
  return (
    <div>
      <PageHeader title="Tutup kasir" subtitle="Pencocokan uang tunai dan settlement EDC per shift, lengkap dengan foto buktinya." />
      <DateRangeBar value={range} onChange={setRange} />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !data.length && <Empty title="Belum ada shift di rentang ini" />}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {data?.map((s) => {
          const sum = s.summary;
          const cashDiff = s.countedCash !== null && sum ? s.countedCash - sum.expectedCash : null;
          const edcDiffs = sum ? (['qris', 'card'] as const).map((m) => (s.settlement?.[m] ?? null) === null ? (sum.byMethod[m] > 0 ? null : 0) : s.settlement![m]! - sum.byMethod[m]) : [];
          const clean = s.closedAt && cashDiff === 0 && edcDiffs.every((d) => d === 0);
          const proofs = s.proofs ?? [];
          return (
            <section key={s.id} className="tile animate-rise flex flex-col gap-4 p-5">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[17px] font-semibold tracking-tight">{formatDateTime(s.openedAt, tz)}</h3>
                  <p className="text-sm text-fg-muted">
                    Dibuka {s.openedByName}
                    {s.closedAt && ` · ditutup ${s.closedByName} ${formatDateTime(s.closedAt, tz)}`}
                  </p>
                </div>
                {!s.closedAt ? <Badge tone="blue">Masih buka</Badge> : clean ? <Badge tone="green">Semua pas</Badge> : <Badge tone="red">Perlu dicek</Badge>}
              </header>

              {sum ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Mini label="Total penjualan" value={formatRupiah(sum.netSales)} />
                    <Mini label="Transaksi" value={`${sum.orderCount}${sum.voidCount ? ` (+${sum.voidCount} void)` : ''}`} />
                    <Mini label="Komplimen" value={sum.compCount ? `${sum.compCount}x · ${formatNumber(sum.compValue ?? 0)}` : '–'} />
                  </div>
                  <Reconciliation shift={s} />
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular sm:grid-cols-4">
                    <Fact label="Modal awal" value={formatNumber(s.openingCash)} />
                    <Fact label="Penjualan tunai" value={formatNumber(sum.byMethod.cash)} />
                    <Fact label="Kas masuk" value={formatNumber(sum.cashIn)} />
                    <Fact label="Kas keluar" value={formatNumber(-sum.cashOut)} />
                  </dl>
                </>
              ) : (
                <p className="text-sm text-fg-muted">Rekap muncul setelah kasir ditutup.</p>
              )}

              {s.closedAt && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Camera className="size-4 text-fg-muted" /> Foto bukti
                    {!proofs.length && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-[#8a5a00]">Tanpa foto</span>}
                  </p>
                  {proofs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {proofs.map((p) => (
                        <ProofThumb key={p.id} proof={p} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {s.cashMovements.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3 text-sm">
                  {s.cashMovements.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3">
                      <span>
                        Kas {m.type === 'in' ? 'masuk' : 'keluar'}: {m.note || '-'}
                      </span>
                      <span className={cx('tabular', m.type === 'in' ? 'text-success' : 'text-danger')}>{formatNumber(m.type === 'in' ? m.amount : -m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.closingNote && <p className="text-sm text-fg-muted">Catatan: {s.closingNote}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile-soft min-w-0 p-3">
      <p className="truncate text-xs text-fg-muted">{label}</p>
      <p className="truncate font-semibold tabular">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Foto diambil dengan sesi owner (tidak bisa lewat <img src> biasa), lalu ditampilkan dari memori. */
function ProofThumb({ proof }: { proof: ShiftProofInfo }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    api<Response>(`/shift-proofs/${proof.id}`, { raw: true })
      .then((r) => r.blob())
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [proof.id]);
  return (
    <>
      <button onClick={() => url && setOpen(true)} className="press w-36 overflow-hidden rounded-2xl border border-line bg-surface-2 text-left" aria-label={`Lihat foto ${PROOF_LABEL[proof.kind]}`}>
        <span className="grid h-24 place-items-center">{url ? <img src={url} alt={PROOF_LABEL[proof.kind]} className="h-24 w-full object-cover" /> : failed ? <ImageOff className="size-6 text-fg-subtle" /> : <Spinner />}</span>
        <span className="block px-2 py-1.5">
          <span className="block truncate text-xs font-semibold">{PROOF_LABEL[proof.kind]}</span>
          <span className="block truncate text-[11px] text-fg-muted">{proof.userName}</span>
        </span>
      </button>
      {open && url && (
        <Modal open size="lg" onClose={() => setOpen(false)} title={PROOF_LABEL[proof.kind]}>
          <img src={url} alt={PROOF_LABEL[proof.kind]} className="mx-auto max-h-[70vh] rounded-xl" />
        </Modal>
      )}
    </>
  );
}
