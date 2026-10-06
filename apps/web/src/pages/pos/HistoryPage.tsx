import { Ban, CloudOff, Printer, Receipt, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { businessDate, formatNumber, formatRupiah, formatTime, PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from '@mourden/shared';
import { OwnerApproval } from '../../components/OwnerApproval';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { ReceiptPreview } from '../../components/ReceiptPreview';
import { toast } from '../../components/feedback';
import { Badge, Button, Empty, ErrorNote, Modal, Segmented, cx, inputClass } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import type { LocalOrder } from '../../lib/idb';
import { listOrders, voidOrder } from '../../lib/pos';
import { useApp } from '../../lib/state';
import { fetchOrderArchive, type ArchiveCursor } from '../../lib/order-archive';
import { previewOrderOps, printOrder, printStatusStore, usePrintStatus, usePrinterConfig, useReceiptStyle } from '../../printing/service';

const VOID_REASONS = ['Salah input', 'Pelanggan batal', 'Menu habis', 'Komplain'];

export function HistoryPage() {
  const shift = useApp((s) => s.activeShift);
  const tz = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const syncCount = useApp((s) => s.sync.pending + s.sync.failed);
  const [scope, setScope] = useState<'shift' | 'all' | 'server'>('shift');
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [payment, setPayment] = useState<PaymentMethod | 'all'>('all');
  const [status, setStatus] = useState<'paid' | 'void' | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(100);
  const [archiveError, setArchiveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<ArchiveCursor | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (scope === 'server') return;
    const list = await listOrders(scope === 'shift' && shift ? { shiftId: shift.id } : {});
    setOrders(list);
  }, [scope, shift]);

  const loadArchive = useCallback(async (cursor: ArchiveCursor | null = null) => {
    const ticket = ++request.current;
    setBusy(true); setArchiveError('');
    try {
      const today = businessDate(new Date().toISOString(), tz);
      const result = await fetchOrderArchive({ from: from || today, to: to || today, q: query, status, payment }, cursor);
      if (ticket !== request.current) return;
      setOrders((old) => cursor ? [...old, ...result.orders.filter((o) => !old.some((p) => p.id === o.id))] : result.orders);
      setNext(result.next);
    } catch (e) { if (ticket === request.current) setArchiveError(errorMessage(e)); }
    finally { if (ticket === request.current) setBusy(false); }
  }, [from, to, query, status, payment, tz]);

  useEffect(() => {
    if (scope !== 'server') { request.current++; setBusy(false); setArchiveError(''); return; }
    setOrders([]); setNext(null);
    const timer = setTimeout(() => void loadArchive(), 350);
    return () => { clearTimeout(timer); request.current++; };
  }, [scope, loadArchive, syncCount]);

  useEffect(() => {
    void load();
  }, [load, syncCount]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      const date = businessDate(o.createdAt, tz);
      return (!q || o.number.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)) &&
        (!from || date >= from) && (!to || date <= to) && (payment === 'all' || o.payment.method === payment) &&
        (status === 'all' || o.status === status);
    });
  }, [orders, query, from, to, payment, status, tz]);
  useEffect(() => { setVisibleCount(100); }, [query, scope, from, to, payment, status]);
  const selected = filtered.find((o) => o.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="grid h-full grid-cols-[minmax(320px,40%)_1fr]">
      <div className="flex min-h-0 flex-col border-r border-line bg-surface">
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'shift', label: 'Shift ini' },
              { value: 'all', label: 'Semua di tablet' },
              { value: 'server', label: 'Arsip server' },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nomor / nama" className={cx(inputClass, 'h-11 pl-10')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-fg-muted">Dari tanggal<input aria-label="Riwayat dari tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cx(inputClass, 'mt-1 text-sm')} /></label>
            <label className="text-xs text-fg-muted">Sampai tanggal<input aria-label="Riwayat sampai tanggal" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(inputClass, 'mt-1 text-sm')} /></label>
            <select aria-label="Metode pembayaran" className={cx(inputClass, 'text-sm')} value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod | 'all')}>
              <option value="all">Semua pembayaran</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}
            </select>
            <select aria-label="Status transaksi" className={cx(inputClass, 'text-sm')} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">Semua status</option><option value="paid">Lunas</option><option value="void">Void</option></select>
          </div>
          <div className="flex items-center justify-between text-xs text-fg-muted"><span>{filtered.length} transaksi · {scope === 'server' ? 'arsip server tablet ini' : 'data lokal tablet'}</span><button className="min-h-11 px-2 font-semibold text-primary" onClick={() => { setFrom(''); setTo(''); setPayment('all'); setStatus('all'); setQuery(''); }}>Reset filter</button></div>
          {scope === 'server' && <><p className="text-xs text-fg-muted">Tanggal kosong memakai hari ini. Arsip yang dimuat disimpan di tablet untuk dibuka lagi saat offline.</p><Button variant="outline" loading={busy} onClick={() => void loadArchive()}>Muat ulang arsip</Button><ErrorNote>{archiveError}</ErrorNote></>}
          {from && to && from > to && <ErrorNote>Rentang tanggal tidak valid.</ErrorNote>}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {filtered.slice(0, visibleCount).map((o) => (
            <li key={o.id}>
              <button
                onClick={() => {
                  setSelectedId(o.id);
                  printStatusStore.set({ status: { state: 'idle' } });
                }}
                className={cx('flex w-full items-center gap-3 px-3 py-3 text-left', selected?.id === o.id ? 'bg-primary/8' : 'hover:bg-surface-2')}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {o.number}
                    {o.status === 'void' && <Badge tone="red">VOID</Badge>}
                    {o.sync !== 'synced' && (
                      <span title={o.sync === 'failed' ? `Gagal sinkron: ${o.syncError}` : 'Belum terkirim ke server'}>
                        <CloudOff className={cx('size-4', o.sync === 'failed' ? 'text-danger' : 'text-warning')} />
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-fg-muted">
                    {scope !== 'shift' ? businessDate(o.createdAt, tz) + ' ' : ''}
                    {formatTime(o.createdAt, tz)} · {PAYMENT_LABEL[o.payment.method]}
                    {o.customerName && ` · ${o.customerName}`}
                  </p>
                </div>
                <span className={cx('font-semibold tabular', o.status === 'void' && 'text-fg-subtle line-through')}>{formatNumber(o.total)}</span>
              </button>
            </li>
          ))}
          {filtered.length > visibleCount && <li className="p-3"><Button className="w-full" variant="outline" onClick={() => setVisibleCount((count) => count + 100)}>Tampilkan 100 berikutnya</Button></li>}
          {scope === 'server' && next && <li className="p-3"><Button className="w-full" variant="outline" loading={busy} onClick={() => void loadArchive(next)}>Muat halaman arsip berikutnya</Button></li>}
        </ul>
        {!filtered.length && <Empty icon={<Receipt className="size-10 text-fg-subtle" />} title="Belum ada transaksi" />}
      </div>
      <div className="min-h-0 overflow-y-auto p-4">{selected ? <OrderDetail key={selected.id} order={selected} onChanged={() => { if (scope === 'server') void loadArchive(); else void load(); }} /> : null}</div>
    </div>
  );
}

function OrderDetail({ order, onChanged }: { order: LocalOrder; onChanged: () => void }) {
  const user = useApp((s) => s.user)!;
  const shift = useApp((s) => s.activeShift);
  const status = usePrintStatus();
  const [voiding, setVoiding] = useState(false);
  const style = useReceiptStyle();
  const width = usePrinterConfig().width;
  const preview = useMemo(() => {
    if (!style) return null;
    try {
      return previewOrderOps(order, style);
    } catch {
      return null;
    }
  }, [order, style]);
  // Kasir hanya boleh membatalkan transaksi di shift yang sedang berjalan; owner bebas.
  const canVoid = order.status === 'paid' && (user.role === 'owner' || order.shiftId === shift?.id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button size="lg" icon={<Printer className="size-5" />} loading={status.state === 'printing'} onClick={() => void printOrder(order, { reprint: true })}>
          Cetak ulang
        </Button>
        {canVoid && (
          <Button size="lg" variant="outline" className="text-danger" icon={<Ban className="size-5" />} onClick={() => setVoiding(true)}>
            Batalkan (void)
          </Button>
        )}
      </div>
      <PrintStatusCard />
      {order.sync === 'failed' && <ErrorNote>Gagal sinkron ke server: {order.syncError}</ErrorNote>}
      {order.status === 'void' && (
        <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          Dibatalkan oleh {order.voidedByName}. Alasan: {order.voidReason}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-surface-2 p-4">{preview && <ReceiptPreview ops={preview} width={width} />}</div>
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
  const pos = useApp((s) => s.data?.settings.pos);
  const masterReasons = pos?.cancellationReasons ?? [];
  const reasons = [...new Set([...VOID_REASONS, ...masterReasons.filter((r) => r.kind === 'void').map((r) => r.text)])];
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
          <p className="text-fg">
            Total <b>{formatRupiah(order.total)}</b> ({PAYMENT_LABEL[order.payment.method]}).
            {order.payment.method === 'cash' && ' Kembalikan uang tunai ke pelanggan.'} Stok bahan akan dikembalikan.
          </p>
          <p className="text-sm font-semibold">Alasan pembatalan</p>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cx('h-11 rounded-xl px-4 text-sm font-semibold', reason === r ? 'bg-danger text-white' : 'bg-surface-2')}>
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
