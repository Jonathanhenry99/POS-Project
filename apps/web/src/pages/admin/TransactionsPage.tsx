import { useState } from 'react';
import { formatNumber, formatRupiah, formatDateTime, PAYMENT_LABEL, type Order } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, Button, Empty, ErrorNote, Modal, Segmented, Spinner, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { PageHeader } from './AdminRoutes';
import { storeTimezone, today, useApi } from './hooks';
import { DateRangeBar } from './ReportsPage';

export function TransactionsPage() {
  const [range, setRange] = useState({ from: today(), to: today() });
  const [status, setStatus] = useState<'all' | 'paid' | 'void'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const { data, error, loading, reload } = useApi<Order[]>(`/orders?from=${range.from}&to=${range.to}&status=${status}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
  const tz = storeTimezone();

  return (
    <div className="p-4">
      <PageHeader title="Transaksi" subtitle="Data yang sudah tersinkron dari tablet kasir" />
      <DateRangeBar value={range} onChange={setRange} />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-72">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Semua' },
              { value: 'paid', label: 'Lunas' },
              { value: 'void', label: 'Void' },
            ]}
          />
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor / nama" className={cx(inputClass, 'max-w-xs')} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !data.length && <Empty title="Tidak ada transaksi" />}
      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">Waktu</th>
                <th className="hidden px-3 py-2 sm:table-cell">Kasir</th>
                <th className="px-3 py-2">Metode</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map((o) => (
                <tr key={o.id} onClick={() => setSelected(o)} className="cursor-pointer hover:bg-stone-50">
                  <td className="px-3 py-3 font-semibold">
                    {o.number} {o.status === 'void' && <Badge tone="red">VOID</Badge>}
                  </td>
                  <td className="px-3 py-3">{formatDateTime(o.createdAt, tz)}</td>
                  <td className="hidden px-3 py-3 sm:table-cell">{o.cashierName}</td>
                  <td className="px-3 py-3">{PAYMENT_LABEL[o.payment.method]}</td>
                  <td className={cx('px-3 py-3 text-right font-semibold tabular', o.status === 'void' && 'text-stone-400 line-through')}>{formatNumber(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <OrderModal
          order={selected}
          onClose={() => setSelected(null)}
          onVoided={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function OrderModal({ order: o, onClose, onVoided }: { order: Order; onClose: () => void; onVoided: () => void }) {
  const user = useApp((s) => s.user)!;
  const tz = storeTimezone();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doVoid = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/orders/${o.id}/void`, {
        method: 'POST',
        body: { reason, voidedAt: new Date().toISOString(), voidedById: user.id, voidedByName: user.name, approvedById: user.id },
      });
      toast(`Transaksi ${o.number} dibatalkan`);
      onVoided();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Transaksi ${o.number}`}
      footer={
        o.status === 'paid' &&
        (voiding ? (
          <>
            <Button variant="outline" onClick={() => setVoiding(false)}>
              Batal
            </Button>
            <Button variant="danger" className="flex-1" loading={busy} disabled={reason.trim().length < 3} onClick={doVoid}>
              Ya, batalkan transaksi
            </Button>
          </>
        ) : (
          <Button variant="outline" className="text-red-600" onClick={() => setVoiding(true)}>
            Batalkan (void)
          </Button>
        ))
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-stone-600">
          {formatDateTime(o.createdAt, tz)} · {o.cashierName}
          {o.customerName && ` · ${o.customerName}`}
        </p>
        {o.status === 'void' && (
          <p className="rounded-xl bg-red-50 p-3 text-red-800">
            Dibatalkan oleh {o.voidedByName} {o.voidedAt && `(${formatDateTime(o.voidedAt, tz)})`}. Alasan: {o.voidReason}
          </p>
        )}
        <ul className="divide-y divide-stone-100">
          {o.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>
                <b>
                  {i.qty}× {i.name}
                </b>
                {i.options.length > 0 && <span className="block text-stone-500">{i.options.map((x) => x.name).join(', ')}</span>}
                {i.note && <span className="block text-amber-700 italic">{i.note}</span>}
              </span>
              <span className="tabular">{formatNumber(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="tabular space-y-1 border-t border-stone-200 pt-2">
          <Row label="Subtotal" value={o.subtotal} />
          {o.discountAmount > 0 && <Row label={`Diskon${o.discount?.reason ? ` (${o.discount.reason})` : ''}`} value={-o.discountAmount} />}
          {o.serviceAmount > 0 && <Row label={`Service ${o.servicePct}%`} value={o.serviceAmount} />}
          {o.taxAmount > 0 && <Row label={`${o.taxLabel} ${o.taxPct}%`} value={o.taxAmount} />}
          {o.roundingAmount !== 0 && <Row label="Pembulatan" value={o.roundingAmount} />}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd>{formatRupiah(o.total)}</dd>
          </div>
          <Row label={PAYMENT_LABEL[o.payment.method] + (o.payment.reference ? ` (${o.payment.reference})` : '')} value={o.payment.tendered} />
          {o.payment.change > 0 && <Row label="Kembali" value={o.payment.change} />}
        </dl>
        {voiding && (
          <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-3">
            <p className="font-semibold text-red-800">Alasan pembatalan</p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Contoh: salah input" autoFocus />
            <p className="text-xs text-red-700">Stok bahan akan dikembalikan. Uang tunai yang sudah masuk laci tidak otomatis berubah.</p>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-stone-600">
      <dt>{label}</dt>
      <dd>{formatNumber(value)}</dd>
    </div>
  );
}
