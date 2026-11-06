import { CloudAlert, DoorClosed, Store, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime, formatNumber, formatRupiah, type Shift, type ShiftSummary } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Modal, MoneyInput, TextInput, cx } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { storeTimezone, useApi } from './hooks';

interface OpenShift extends Shift {
  deviceName: string;
  liveSummary: ShiftSummary;
}
interface OpenDay {
  id: string;
  businessDate: string;
  openedAt: string;
  deviceName: string | null;
  openShifts: number;
}
interface SyncIssues {
  deviceName: string;
  at: string;
  items: { label: string; path: string; error: string; createdAt: string }[];
}
interface OpenState {
  shifts: OpenShift[];
  days: OpenDay[];
  issues: SyncIssues[];
}

/**
 * Kasir yang masih buka di server (shift & hari usaha), dengan tutup paksa untuk owner yang tidak di lokasi, plus
 * kiriman tablet yang ditolak server. Tidak tampil apa-apa bila semuanya sudah tertutup rapi.
 */
export function OpenStatePanel({ compact = false, onChanged }: { compact?: boolean; onChanged?: () => void }) {
  const tablet = useApp((s) => s.mode === 'tablet');
  const { data, reload } = useApi<OpenState>(tablet ? null : '/admin/open-state');
  const [closing, setClosing] = useState<OpenShift | null>(null);
  const [busy, setBusy] = useState('');
  const tz = storeTimezone();
  if (!data) return null;
  const orphanDays = data.days.filter((d) => d.openShifts === 0);
  if (!data.shifts.length && !orphanDays.length && !data.issues.length) return null;

  if (compact) {
    return (
      <Link to="/admin/shift" className="tile animate-float-up flex items-center gap-3 border border-warning/40 p-4 transition-shadow hover:ring-2 hover:ring-warning/30">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-[#8a5a00]">
          <Store className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {data.shifts.length ? `${data.shifts.length} kasir masih buka` : orphanDays.length ? 'Hari usaha belum ditutup' : 'Ada kiriman tablet yang gagal'}
          </span>
          <span className="block text-sm text-fg-muted">
            {data.shifts.map((s) => `${s.openedByName} di ${s.deviceName} sejak ${formatDateTime(s.openedAt, tz)}`).join(' · ') || 'Buka Tutup Kasir untuk melihat dan menutupnya.'}
          </span>
        </span>
        <span className="text-sm font-semibold text-primary">Periksa →</span>
      </Link>
    );
  }

  const refresh = () => {
    reload();
    onChanged?.();
  };

  const closeDay = async (d: OpenDay) => {
    const ok = await confirmDialog({ title: `Tutup hari usaha ${d.businessDate}?`, message: 'Semua shift hari ini sudah ditutup. Rekap hari dihitung dari shift-shift tersebut.', confirmLabel: 'Tutup hari' });
    if (!ok) return;
    setBusy(d.id);
    try {
      await api(`/admin/business-days/${d.id}/force-close`, { method: 'POST', body: {} });
      toast('Hari usaha ditutup');
      refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="animate-rise mb-5 flex flex-col gap-3">
      {data.shifts.map((s) => {
        const sum = s.liveSummary;
        return (
          <article key={s.id} className="rounded-3xl border-2 border-warning/40 bg-surface p-5 shadow-card">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-70" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-warning" />
                  </span>
                  Kasir masih buka · {s.deviceName}
                </p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  Dibuka {s.openedByName} {formatDateTime(s.openedAt, tz)} · modal {formatRupiah(s.openingCash)}
                </p>
              </div>
              <Button variant="danger" icon={<DoorClosed className="size-5" />} onClick={() => setClosing(s)}>
                Tutup paksa
              </Button>
            </header>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Penjualan" value={formatRupiah(sum.netSales)} />
              <Stat label="Transaksi" value={`${sum.orderCount}${sum.voidCount ? ` (+${sum.voidCount} void)` : ''}`} />
              <Stat label="Tunai seharusnya" value={formatRupiah(sum.expectedCash)} />
              <Stat label="QRIS / Debit" value={`${formatNumber(sum.byMethod.qris)} / ${formatNumber(sum.byMethod.card)}`} />
            </div>
          </article>
        );
      })}

      {orphanDays.map((d) => (
        <article key={d.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-warning/40 bg-surface p-4 shadow-card">
          <TriangleAlert className="size-5 shrink-0 text-[#8a5a00]" />
          <p className="min-w-0 flex-1 text-sm">
            <b>Hari usaha {d.businessDate}</b> di {d.deviceName ?? 'tablet'} belum ditutup, padahal semua shift-nya sudah ditutup.
          </p>
          <Button size="sm" variant="outline" loading={busy === d.id} onClick={() => void closeDay(d)}>
            Tutup hari
          </Button>
        </article>
      ))}

      {data.issues.map((i) => (
        <article key={i.deviceName} className="rounded-3xl border border-danger/30 bg-surface p-4 shadow-card">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <CloudAlert className="size-5" /> {i.items.length} kiriman dari {i.deviceName} ditolak server
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {i.items.map((it, n) => (
              <li key={n} className="rounded-xl bg-danger/6 px-3 py-2">
                <span className="font-semibold">{it.label}</span> <span className="text-fg-muted">· {formatDateTime(it.createdAt, tz)}</span>
                <span className="block text-fg-muted">{it.error}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-muted">Dilaporkan tablet {formatDateTime(i.at, tz)}. Setelah masalahnya beres, kasir menekan "Kirim ulang" atau "Buang" di halaman Sinkron tablet.</p>
        </article>
      ))}

      {closing && <ForceCloseModal shift={closing} onClose={() => setClosing(null)} onDone={refresh} />}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="font-bold tabular">{value}</p>
    </div>
  );
}

function ForceCloseModal({ shift, onClose, onDone }: { shift: OpenShift; onClose: () => void; onDone: () => void }) {
  const tz = storeTimezone();
  const [known, setKnown] = useState(true);
  const [cash, setCash] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sum = shift.liveSummary;
  const diff = known ? cash - sum.expectedCash : null;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ dayClosed: boolean }>(`/admin/shifts/${shift.id}/force-close`, { method: 'POST', body: { countedCash: known ? cash : null, note } });
      toast(r.dayClosed ? 'Shift dan hari usaha ditutup. Tablet ikut menutupnya saat tersambung.' : 'Shift ditutup. Tablet ikut menutupnya saat tersambung.');
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open size="sm" onClose={onClose} dismissable={!busy} title="Tutup paksa kasir">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          Shift {shift.openedByName} sejak {formatDateTime(shift.openedAt, tz)} di {shift.deviceName}. Rekap dihitung dari {sum.orderCount} transaksi yang sudah masuk server. Hari usahanya ikut ditutup.
        </p>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm tabular">
          <Row label="Total penjualan" value={formatRupiah(sum.netSales)} />
          <Row label="Tunai seharusnya di laci" value={formatRupiah(sum.expectedCash)} strong />
          <Row label="QRIS" value={formatRupiah(sum.byMethod.qris)} />
          <Row label="Debit/Kredit" value={formatRupiah(sum.byMethod.card)} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg-muted">Uang tunai yang dihitung</p>
            <button className="text-xs font-semibold text-primary" onClick={() => setKnown((v) => !v)}>
              {known ? 'Belum tahu' : 'Isi jumlahnya'}
            </button>
          </div>
          {known ? <MoneyInput aria-label="Uang tunai yang dihitung" value={cash} onChange={setCash} /> : <p className="rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">Dikosongkan. Pencocokan tunai shift ini tampil "belum dihitung".</p>}
          {diff !== null && (
            <p className={cx('mt-1.5 text-sm font-semibold', diff === 0 ? 'text-success' : 'text-danger')}>
              {diff === 0 ? 'Pas' : diff > 0 ? `Lebih ${formatRupiah(diff)}` : `Kurang ${formatRupiah(-diff)}`}
            </p>
          )}
        </div>
        <TextInput aria-label="Catatan" placeholder="Catatan (mis. dihitung barista, owner tidak di lokasi)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Badge tone="amber">Tercatat</Badge> Tutup paksa tercatat atas nama Anda di log.
        </div>
        <Button variant="danger" size="lg" loading={busy} onClick={() => void submit()}>
          Tutup shift & hari
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={cx('flex justify-between gap-3 py-0.5', strong && 'font-bold')}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}
