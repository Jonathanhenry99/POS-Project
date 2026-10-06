import { ArrowDownCircle, ArrowUpCircle, Lock, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime, formatNumber, formatRupiah, PAYMENT_LABEL, PAYMENT_METHODS, type Shift, type ShiftSummary } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { confirmDialog, toast } from '../../components/feedback';
import { Button, Card, ErrorNote, Field, MoneyInput, Modal, Segmented, TextInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { addCashMovement, closeShift, currentShiftSummary, lastClosedShift } from '../../lib/pos';
import { useApp } from '../../lib/state';
import { printShift, printStatusStore } from '../../printing/service';

export function ShiftPage() {
  const shift = useApp((s) => s.activeShift);
  const tz = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const pending = useApp((s) => s.sync.pending);
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [lastClosed, setLastClosed] = useState<Shift | null>(null);
  const [cashSheet, setCashSheet] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    void currentShiftSummary().then(setSummary);
    void lastClosedShift().then(setLastClosed);
  }, [shift, pending]);

  if (!shift) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <Card title="Tidak ada shift aktif">
          <p className="mb-3 text-stone-600">Buka shift dari layar Kasir untuk mulai berjualan.</p>
          <Button onClick={() => navigate('/kasir')}>Ke layar kasir</Button>
        </Card>
        {lastClosed && <ClosedShiftCard shift={lastClosed} tz={tz} />}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 overflow-y-auto p-4 md:grid-cols-2">
      <Card title="Shift berjalan">
        <p className="text-stone-600">
          Dibuka {formatDateTime(shift.openedAt, tz)} oleh <b>{shift.openedByName}</b>
        </p>
        {summary && <SummaryTable summary={summary} openingCash={shift.openingCash} />}
      </Card>
      <div className="flex flex-col gap-4">
        <Card
          title="Kas masuk / keluar"
          action={
            <Button size="sm" variant="outline" onClick={() => setCashSheet(true)}>
              Catat
            </Button>
          }
        >
          {!shift.cashMovements.length ? (
            <p className="text-sm text-stone-500">Contoh: beli es batu, setor uang ke owner, tambah uang kembalian.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {shift.cashMovements.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  {m.type === 'in' ? <ArrowDownCircle className="size-5 text-emerald-600" /> : <ArrowUpCircle className="size-5 text-red-600" />}
                  <span className="flex-1">{m.note || (m.type === 'in' ? 'Kas masuk' : 'Kas keluar')}</span>
                  <span className={cx('font-semibold tabular', m.type === 'in' ? 'text-emerald-700' : 'text-red-700')}>
                    {m.type === 'in' ? '+' : '-'}
                    {formatNumber(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Button size="xl" variant="primary" icon={<Lock className="size-6" />} onClick={() => setClosing(true)}>
          Tutup kasir
        </Button>
      </div>
      {cashSheet && <CashMovementSheet onClose={() => setCashSheet(false)} />}
      {closing && summary && <CloseShiftSheet summary={summary} onClose={() => setClosing(false)} onClosed={setLastClosed} />}
    </div>
  );
}

function SummaryTable({ summary: s, openingCash }: { summary: ShiftSummary; openingCash: number }) {
  const row = (label: string, value: number, bold = false) => (
    <div className={cx('flex justify-between py-1', bold && 'font-bold')}>
      <span>{label}</span>
      <span className="tabular">{formatNumber(value)}</span>
    </div>
  );
  return (
    <div className="mt-3 text-sm">
      <div className="flex justify-between py-1">
        <span>Transaksi</span>
        <span className="tabular">
          {s.orderCount}
          {s.voidCount ? ` (+${s.voidCount} void)` : ''}
        </span>
      </div>
      {row('Penjualan bersih', s.netSales, true)}
      <div className="my-2 border-t border-stone-100" />
      {PAYMENT_METHODS.map((m) => row(PAYMENT_LABEL[m], s.byMethod[m]))}
      <div className="my-2 border-t border-stone-100" />
      {row('Modal awal', openingCash)}
      {row('Penjualan tunai', s.byMethod.cash)}
      {s.cashIn > 0 && row('Kas masuk', s.cashIn)}
      {s.cashOut > 0 && row('Kas keluar', -s.cashOut)}
      {row('Uang di laci seharusnya', s.expectedCash, true)}
    </div>
  );
}

function CashMovementSheet({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Catat kas"
      footer={
        <Button
          className="flex-1"
          size="lg"
          loading={busy}
          disabled={!amount || !note.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await addCashMovement(type, amount, note);
              toast('Tercatat');
              onClose();
            } catch (e) {
              toast(errorMessage(e), 'error');
              setBusy(false);
            }
          }}
        >
          Simpan
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'out', label: 'Kas keluar' },
            { value: 'in', label: 'Kas masuk' },
          ]}
        />
        <Field label="Jumlah">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus />}</Field>
        <Field label="Keterangan">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="Contoh: beli es batu" />}</Field>
      </div>
    </Modal>
  );
}

function CloseShiftSheet({ summary, onClose, onClosed }: { summary: ShiftSummary; onClose: () => void; onClosed: (s: Shift) => void }) {
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState<Shift | null>(null);
  const diff = counted === null ? null : counted - summary.expectedCash;

  const submit = async () => {
    if (counted === null) return;
    if (diff !== 0) {
      const ok = await confirmDialog({
        title: 'Ada selisih kas',
        message: `Uang di laci ${diff! > 0 ? 'lebih' : 'kurang'} ${formatRupiah(Math.abs(diff!))} dari seharusnya. Tetap tutup kasir?`,
        confirmLabel: 'Tetap tutup',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const shift = await closeShift(counted, note);
      printStatusStore.set({ status: { state: 'idle' } });
      void printShift(shift);
      setClosed(shift);
      onClosed(shift);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (closed) {
    return (
      <Modal open size="md" onClose={onClose} title="Kasir ditutup">
        <div className="flex flex-col gap-3">
          <p>Rekap tutup kasir sedang dicetak. Serahkan struk rekap beserta uang ke owner.</p>
          <PrintStatusCard />
          <Button variant="outline" icon={<Printer className="size-5" />} onClick={() => void printShift(closed)}>
            Cetak rekap lagi
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title="Tutup kasir"
      footer={
        <Button size="lg" className="flex-1" loading={busy} disabled={counted === null} onClick={submit}>
          Tutup kasir & cetak rekap
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-stone-100 p-3">
          <p className="text-sm text-stone-600">Uang di laci seharusnya</p>
          <p className="text-2xl font-bold tabular">{formatRupiah(summary.expectedCash)}</p>
        </div>
        <Field label="Uang tunai yang dihitung di laci">
          {(id) => <MoneyInput id={id} value={counted ?? 0} onChange={(n) => setCounted(n)} autoFocus placeholder="Hitung lalu ketik" />}
        </Field>
        {diff !== null && (
          <p className={cx('text-lg font-semibold', diff === 0 ? 'text-emerald-700' : 'text-red-700')}>
            {diff === 0 ? 'Pas, tidak ada selisih.' : `Selisih ${diff > 0 ? 'lebih' : 'kurang'} ${formatRupiah(Math.abs(diff))}`}
          </p>
        )}
        <Field label="Catatan (opsional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} />}</Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function ClosedShiftCard({ shift, tz }: { shift: Shift; tz: string }) {
  return (
    <Card
      title="Shift terakhir"
      action={
        <Button size="sm" variant="outline" icon={<Printer className="size-4" />} onClick={() => void printShift(shift)}>
          Cetak rekap
        </Button>
      }
    >
      <p className="text-sm text-stone-600">
        {formatDateTime(shift.openedAt, tz)} – {shift.closedAt && formatDateTime(shift.closedAt, tz)} · {shift.closedByName}
      </p>
      {shift.summary && <SummaryTable summary={shift.summary} openingCash={shift.openingCash} />}
      {shift.countedCash !== null && shift.summary && (
        <p className="mt-2 text-sm font-semibold">
          Dihitung {formatRupiah(shift.countedCash)} · selisih {formatNumber(shift.countedCash - shift.summary.expectedCash)}
        </p>
      )}
      <div className="mt-3">
        <PrintStatusCard />
      </div>
    </Card>
  );
}
