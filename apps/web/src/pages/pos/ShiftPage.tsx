import { ArrowDownCircle, ArrowUpCircle, Lock, Printer, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime, formatNumber, formatRupiah, PAYMENT_LABEL, PAYMENT_METHODS, type Shift, type ShiftSummary } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { Reconciliation } from '../../components/Reconciliation';
import { ClosingSheet } from './ClosingSheet';
import { confirmDialog, toast } from '../../components/feedback';
import { Button, Card, ErrorNote, Field, MoneyInput, Modal, Segmented, TextInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { addCashMovement, closeShift, currentShiftSummary, lastClosedShift } from '../../lib/pos';
import { useApp, useBlindCash } from '../../lib/state';
import { printShift, printStatusStore } from '../../printing/service';

export function ShiftPage() {
  const shift = useApp((s) => s.activeShift);
  const tz = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const pending = useApp((s) => s.sync.pending);
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [lastClosed, setLastClosed] = useState<Shift | null>(null);
  const [cashSheet, setCashSheet] = useState(false);
  const [closing, setClosing] = useState<'shift' | 'day' | null>(null);
  const blind = useBlindCash();

  useEffect(() => {
    void currentShiftSummary().then(setSummary);
    void lastClosedShift().then(setLastClosed);
  }, [shift, pending]);

  // Lembar penutupan tetap tampil setelah shift tertutup (untuk menunjukkan hasil pencocokan).
  const closingSheet = closing && <ClosingSheet mode={closing} onClose={() => setClosing(null)} onFinished={(s) => setLastClosed(s)} />;

  if (!shift) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        {closingSheet}
        <Card title="Tidak ada shift aktif">
          <p className="mb-3 text-fg-muted">Buka shift dari layar Kasir untuk mulai berjualan.</p>
          <Button onClick={() => navigate('/kasir')}>Ke layar kasir</Button>
        </Card>
        {lastClosed && <ClosedShiftCard shift={lastClosed} tz={tz} />}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Shift & kas</h1>
        <p className="text-sm text-fg-muted">
          Shift dibuka {formatDateTime(shift.openedAt, tz)} oleh <b>{shift.openedByName}</b>
        </p>
      </div>
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ShiftStat label="Total penjualan" value={formatRupiah(summary.netSales)} icon={<TrendingUp className="size-5" />} tone="bg-primary/10 text-primary" />
          <ShiftStat label="Transaksi" value={`${summary.orderCount}${summary.voidCount ? ` (+${summary.voidCount} void)` : ''}`} icon={<Receipt className="size-5" />} tone="bg-accent/12 text-accent" />
          <ShiftStat label={blind ? 'Uang laci dihitung' : 'Uang di laci seharusnya'} value={blind ? 'Saat tutup' : formatRupiah(summary.expectedCash)} icon={<Wallet className="size-5" />} tone="bg-success/12 text-success" />
          <ShiftStat
            label="Kas masuk / keluar"
            value={`+${formatNumber(summary.cashIn)} / −${formatNumber(summary.cashOut)}`}
            icon={<ArrowDownCircle className="size-5" />}
            tone="bg-surface-3 text-fg-muted"
          />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
      <Card title="Rincian shift berjalan">
        {summary && <SummaryTable summary={summary} openingCash={shift.openingCash} blind={blind} />}
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
            <p className="text-sm text-fg-muted">Contoh: beli es batu, setor uang ke owner, tambah uang kembalian.</p>
          ) : (
            <ul className="divide-y divide-line">
              {shift.cashMovements.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  {m.type === 'in' ? <ArrowDownCircle className="size-5 text-success" /> : <ArrowUpCircle className="size-5 text-danger" />}
                  <span className="flex-1">{m.note || (m.type === 'in' ? 'Kas masuk' : 'Kas keluar')}</span>
                  <span className={cx('font-semibold tabular', m.type === 'in' ? 'text-success' : 'text-danger')}>
                    {m.type === 'in' ? '+' : '-'}
                    {formatNumber(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {/* Hanya dua aksi penutupan, sama dengan halaman Ganti Shift / Hari. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Button size="lg" variant="outline" className="w-full" onClick={() => setClosing('shift')}>
              Akhiri shift
            </Button>
            <p className="mt-1.5 text-xs text-fg-muted">Ganti petugas. Hari usaha tetap berjalan.</p>
          </div>
          <div>
            <Button size="lg" variant="primary" className="w-full" icon={<Lock className="size-5" />} onClick={() => setClosing('day')}>
              Tutup toko
            </Button>
            <p className="mt-1.5 text-xs text-fg-muted">Akhir hari: tutup shift terakhir dan rekap hari.</p>
          </div>
        </div>
      </div>
      </div>
      {cashSheet && <CashMovementSheet onClose={() => setCashSheet(false)} />}
      {closingSheet}
    </div>
    </div>
  );
}

/** `blind`: sembunyikan rincian per metode & kas laci (shift berjalan, kasir non-owner). */
export function SummaryTable({ summary: s, openingCash, blind = false }: { summary: ShiftSummary; openingCash: number; blind?: boolean }) {
  const row = (label: string, value: number, bold = false) => (
    <div key={label} className={cx('flex justify-between py-1', bold && 'font-bold')}>
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
      {row('Total penjualan', s.netSales, true)}
      {(s.compCount ?? 0) > 0 && row(`Komplimen karyawan (${s.compCount}x, tidak dibayar)`, s.compValue ?? 0)}
      <div className="my-2 border-t border-line" />
      {blind ? (
        <>
          {s.cashIn > 0 && row('Kas masuk', s.cashIn)}
          {s.cashOut > 0 && row('Kas keluar', -s.cashOut)}
          <p className="mt-2 rounded-xl bg-surface-2 p-3 text-fg-muted">Rincian tunai dan uang laci tampil setelah shift diakhiri. Hitung uang di laci apa adanya saat itu.</p>
        </>
      ) : (
        <>
          {PAYMENT_METHODS.map((m) => row(PAYMENT_LABEL[m], s.byMethod[m]))}
          <div className="my-2 border-t border-line" />
          {row('Modal awal', openingCash)}
          {row('Penjualan tunai', s.byMethod.cash)}
          {s.cashIn > 0 && row('Kas masuk', s.cashIn)}
          {s.cashOut > 0 && row('Kas keluar', -s.cashOut)}
          {row('Uang di laci seharusnya', s.expectedCash, true)}
        </>
      )}
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
      <p className="text-sm text-fg-muted">
        {formatDateTime(shift.openedAt, tz)} – {shift.closedAt && formatDateTime(shift.closedAt, tz)} · {shift.closedByName}
      </p>
      <div className="my-3">
        <Reconciliation shift={shift} />
      </div>
      {shift.summary && <SummaryTable summary={shift.summary} openingCash={shift.openingCash} />}
      <div className="mt-3">
        <PrintStatusCard />
      </div>
    </Card>
  );
}

function ShiftStat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="animate-rise flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-lg leading-tight font-extrabold tabular">{value}</span>
        <span className="text-xs text-fg-muted">{label}</span>
      </span>
    </div>
  );
}
