import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList, Utensils } from 'lucide-react';
import { formatDateTime, formatRupiah, ORDER_TYPE_LABEL } from '@mourden/shared';
import { Button, Card, Empty } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { errorMessage } from '../../lib/api';
import { cartTotals } from '../../lib/pos';
import { useApp } from '../../lib/state';
import { deleteSaved, openSaved, setService, setOrderType, useCart, useCartEvents, useSaved } from './cart';
import { CancellationSheet } from './ServiceSheets';

export function TablesPage() {
  const data = useApp((s) => s.data); const cart = useCart(); const saved = useSaved();
  const events = useCartEvents(); const [showLog, setShowLog] = useState(false);
  const navigate = useNavigate(); const [cancelId, setCancelId] = useState<string | null>(null);
  if (!data) return <Empty title="Data toko belum tersedia" />;
  const tables = [...new Set([...(data.settings.pos?.tables ?? []), ...saved.map((o) => o.tableName).filter(Boolean), ...(cart.tableName ? [cart.tableName] : [])])];
  const open = (id: string) => { try { openSaved(id); navigate('/kasir'); } catch (e) { toast(errorMessage(e), 'error'); } };
  return <div className="h-full overflow-y-auto p-4"><div className="mx-auto flex max-w-6xl flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Meja & pesanan</h1><Button onClick={() => navigate('/kasir')}>Kembali ke kasir</Button></div>
    <p className="text-sm text-fg-muted">Status meja dan pesanan belum dibayar pada tablet ini. Pesanan tersimpan tidak dianggap penjualan sampai dibayar. Untuk pindah meja atau sebagian item, buka pesanan lalu gunakan tombol di kasir.</p>
    <Card title="Meja">
      {!tables.length ? <p className="text-fg-muted">Daftar meja dapat ditambahkan owner di Pengaturan → Master operasional kasir.</p> : <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">{tables.map((name) => {
        const order = saved.find((o) => o.tableName === name); const active = cart.tableName === name && cart.lines.length > 0;
        return <button key={name} className={`min-h-32 rounded-2xl border-2 p-4 text-left ${order || active ? 'border-accent/50 bg-accent/8' : 'border-line bg-surface-2'}`} onClick={async () => {
          if (order) { open(order.id); return; }
          if (active) { navigate('/kasir'); return; }
          if (cart.lines.length && !await confirmDialog({ title: 'Pindah meja pesanan aktif?', message: `Seluruh pesanan aktif akan memakai ${name}. Item dan harga tetap.`, confirmLabel: 'Pindah meja' })) return;
          try { setOrderType('dine_in'); setService(name, cart.pax); navigate('/kasir'); } catch (e) { toast(errorMessage(e), 'error'); }
        }}><Utensils className="mb-2 size-5 text-primary" /><b>{name}</b><span className="mt-1 block text-sm text-fg-muted">{order ? `${order.pax || 0} tamu · Tersimpan` : active ? 'Pesanan aktif' : 'Kosong'}</span></button>;
      })}</div>}
    </Card>
    <Card title="Log pesanan tablet"><Button variant="outline" onClick={() => setShowLog((v) => !v)}>{showLog ? 'Tutup log' : 'Lihat log pembatalan / pemindahan'}</Button>{showLog && <ul className="mt-3 divide-y divide-line">{[...events].reverse().map((event, i) => <li key={i} className="py-3 text-sm"><b>{event.action}</b><p className="text-fg-muted">{formatDateTime(event.at, data.settings.store.timezone)} · {event.actor || 'Operator'}</p>{event.reason && <p>Alasan: {event.reason}</p>}</li>)}{!events.length && <li>Belum ada log. Disimpan lokal untuk 100 aksi terakhir.</li>}</ul>}</Card>
    <Card title={`Pesanan tersimpan (${saved.length})`}>
      {!saved.length ? <Empty icon={<ClipboardList className="size-8" />} title="Belum ada pesanan tersimpan" /> : <ul className="divide-y divide-line">{[...saved].reverse().map((o) => <li key={o.id} className="flex flex-wrap items-center gap-3 py-3"><button className="min-h-12 flex-1 text-left" onClick={() => open(o.id)}><b>{o.label}</b><span className="block text-sm text-fg-muted">{ORDER_TYPE_LABEL[o.orderType]} · {o.tableName || 'Tanpa meja'} · {o.pax || 0} tamu · {o.lines.reduce((n, l) => n + l.qty, 0)} item</span></button><b>{formatRupiah(cartTotals(o.lines, o.discount, data.settings.pricing).total)}</b><Button variant="outline" onClick={() => open(o.id)}>Buka</Button><Button variant="outline" className="text-danger" onClick={() => setCancelId(o.id)}>Batalkan</Button></li>)}</ul>}
    </Card>
    {cancelId && <CancellationSheet kind="order" title="Batalkan pesanan tersimpan?" onClose={() => setCancelId(null)} onSubmit={(reason) => { deleteSaved(cancelId, reason); setCancelId(null); }} />}
  </div></div>;
}
