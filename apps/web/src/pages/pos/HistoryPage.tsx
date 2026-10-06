import { Ban, CloudOff, Printer, Receipt, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatNumber, formatRupiah, formatTime, PAYMENT_LABEL } from '@mourden/shared';
import { OwnerApproval } from '../../components/OwnerApproval';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { toast } from '../../components/feedback';
import { Badge, Button, Empty, ErrorNote, Modal, Segmented, cx, inputClass } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import type { LocalOrder } from '../../lib/idb';
import { listOrders, voidOrder } from '../../lib/pos';
import { useApp } from '../../lib/state';
import { previewOrder, printOrder, printStatusStore, usePrintStatus } from '../../printing/service';

const VOID_REASONS = ['Salah input', 'Pelanggan batal', 'Menu habis', 'Komplain'];

export function HistoryPage() {
  const shift = useApp((s) => s.activeShift);
  const tz = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const syncCount = useApp((s) => s.sync.pending + s.sync.failed);
  const [scope, setScope] = useState<'shift' | 'all'>('shift');
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listOrders(scope === 'shift' && shift ? { shiftId: shift.id } : { limit: 300 });
    setOrders(list);
  }, [scope, shift]);

  useEffect(() => {
    void load();
  }, [load, syncCount]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orders.filter((o) => o.number.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)) : orders;
  }, [orders, query]);
  const selected = orders.find((o) => o.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="grid h-full grid-cols-[minmax(320px,40%)_1fr]">
      <div className="flex min-h-0 flex-col border-r border-stone-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-stone-100 p-3">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'shift', label: 'Shift ini' },
              { value: 'all', label: 'Semua di tablet' },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nomor / nama" className={cx(inputClass, 'h-11 pl-10')} />
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto">
          {filtered.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => {
                  setSelectedId(o.id);
                  printStatusStore.set({ status: { state: 'idle' } });
                }}
                className={cx('flex w-full items-center gap-3 px-3 py-3 text-left', selected?.id === o.id ? 'bg-brand-50' : 'hover:bg-stone-50')}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {o.number}
                    {o.status === 'void' && <Badge tone="red">VOID</Badge>}
                    {o.sync !== 'synced' && (
                      <span title={o.sync === 'failed' ? `Gagal sinkron: ${o.syncError}` : 'Belum terkirim ke server'}>
                        <CloudOff className={cx('size-4', o.sync === 'failed' ? 'text-red-600' : 'text-amber-600')} />
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-stone-500">
                    {scope === 'all' ? new Date(o.createdAt).toLocaleDateString('id-ID') + ' ' : ''}
                    {formatTime(o.createdAt, tz)} · {PAYMENT_LABEL[o.payment.method]}
                    {o.customerName && ` · ${o.customerName}`}
                  </p>
                </div>
                <span className={cx('font-semibold tabular', o.status === 'void' && 'text-stone-400 line-through')}>{formatNumber(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
        {!filtered.length && <Empty icon={<Receipt className="size-10 text-stone-300" />} title="Belum ada transaksi" />}
      </div>
      <div className="min-h-0 overflow-y-auto p-4">{selected ? <OrderDetail key={selected.id} order={selected} onChanged={load} /> : null}</div>
    </div>
  );
}

function OrderDetail({ order, onChanged }: { order: LocalOrder; onChanged: () => void }) {
  const user = useApp((s) => s.user)!;
  const shift = useApp((s) => s.activeShift);
  const status = usePrintStatus();
  const [voiding, setVoiding] = useState(false);
  const preview = useMemo(() => {
    try {
      return previewOrder(order);
    } catch {
      return '';
    }
  }, [order]);
  // Kasir hanya boleh membatalkan transaksi di shift yang sedang berjalan; owner bebas.
  const canVoid = order.status === 'paid' && (user.role === 'owner' || order.shiftId === shift?.id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button size="lg" icon={<Printer className="size-5" />} loading={status.state === 'printing'} onClick={() => void printOrder(order, { reprint: true })}>
          Cetak ulang
        </Button>
        {canVoid && (
          <Button size="lg" variant="outline" className="text-red-600" icon={<Ban className="size-5" />} onClick={() => setVoiding(true)}>
            Batalkan (void)
          </Button>
        )}
      </div>
      <PrintStatusCard />
      {order.sync === 'failed' && <ErrorNote>Gagal sinkron ke server: {order.syncError}</ErrorNote>}
      {order.status === 'void' && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          Dibatalkan oleh {order.voidedByName}. Alasan: {order.voidReason}
        </div>
      )}
      <pre className="overflow-x-auto rounded-2xl border border-stone-200 bg-white p-4 font-mono text-[13px] leading-snug text-stone-800 shadow-sm">{preview}</pre>
      {voiding && (
        <VoidSheet
          order={order}
          onClose={() => setVoiding(false)}
          onDone={() => {
            setVoiding(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function VoidSheet({ order, onClose, onDone }: { order: LocalOrder; onClose: () => void; onDone: () => void }) {
  const user = useApp((s) => s.user)!;
  const requireOwner = useApp((s) => s.data?.settings.policy.voidRequiresOwnerPin ?? false) && user.role !== 'owner';
  const [reason, setReason] = useState('');
  const [askOwner, setAskOwner] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (approvedBy: Parameters<typeof voidOrder>[2]) => {
    setBusy(true);
    setError('');
    try {
      await voidOrder(order, reason, approvedBy);
      toast(`Transaksi ${order.number} dibatalkan`);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Batalkan ${order.number}?`}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Kembali
            </Button>
            <Button variant="danger" className="flex-1" loading={busy} disabled={reason.trim().length < 3} onClick={() => (requireOwner ? setAskOwner(true) : run(null))}>
              {requireOwner ? 'Minta PIN owner' : 'Ya, batalkan'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-stone-700">
            Total <b>{formatRupiah(order.total)}</b> ({PAYMENT_LABEL[order.payment.method]}).
            {order.payment.method === 'cash' && ' Kembalikan uang tunai ke pelanggan.'} Stok bahan akan dikembalikan.
          </p>
          <p className="text-sm font-semibold">Alasan pembatalan</p>
          <div className="flex flex-wrap gap-2">
            {VOID_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cx('h-11 rounded-xl px-4 text-sm font-semibold', reason === r ? 'bg-red-600 text-white' : 'bg-stone-100')}>
                {r}
              </button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Tulis alasan lain" className={inputClass} />
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Modal>
      {askOwner && <OwnerApproval reason={`Membatalkan transaksi ${order.number} (${formatRupiah(order.total)}).`} onClose={() => setAskOwner(false)} onApproved={(owner) => run(owner)} />}
    </>
  );
}
