// Bagian-bagian shift yang dipakai halaman Ganti Shift / Hari: tabel rincian, catat kas masuk/keluar, kartu shift terakhir.
import { ArrowDownCircle, ArrowUpCircle, Printer } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime, formatNumber, PAYMENT_LABEL, PAYMENT_METHODS, type Shift, type ShiftSummary } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { Reconciliation } from '../../components/Reconciliation';
import { toast } from '../../components/feedback';
import { Button, Card, ErrorNote, Field, MoneyInput, Modal, Segmented, TextInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { addCashMovement } from '../../lib/pos';
import { printShift } from '../../printing/service';

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
          {s.cashOut > 0 && row('Pengeluaran (kas keluar)', -s.cashOut)}
          <p className="mt-2 rounded-xl bg-surface-2 p-3 text-fg-muted">Rincian tunai dan uang laci tampil setelah shift diakhiri. Hitung uang di laci apa adanya saat itu.</p>
        </>
      ) : (
        <>
          {PAYMENT_METHODS.map((m) => row(PAYMENT_LABEL[m], s.byMethod[m]))}
          <div className="my-2 border-t border-line" />
          {row('Kas awal', openingCash)}
          {row('Pembayaran tunai', s.byMethod.cash)}
          {s.cashIn > 0 && row('Kas masuk', s.cashIn)}
          {s.cashOut > 0 && row('Pengeluaran (kas keluar)', -s.cashOut)}
          {row('Total kas akhir (seharusnya)', s.expectedCash, true)}
        </>
      )}
    </div>
  );
}

export function CashMovementSheet({ onClose }: { onClose: () => void }) {
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

export function ClosedShiftCard({ shift, tz }: { shift: Shift; tz: string }) {
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
