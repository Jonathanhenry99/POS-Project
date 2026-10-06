import { useState } from 'react';
import { Button, ErrorNote, Modal, inputClass } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { setService, transferItems, useCart, useSaved } from './cart';
import { confirmDialog, toast } from '../../components/feedback';

export function ServiceSheet({ onClose }: { onClose: () => void }) {
  const cart = useCart(); const saved = useSaved();
  const pos = useApp((s) => s.data?.settings.pos);
  const tables = pos?.tables ?? [];
  const [table, setTable] = useState(cart.tableName);
  const [pax, setPax] = useState(String(cart.pax || ''));
  const [error, setError] = useState('');
  return <Modal open title="Meja & jumlah tamu" onClose={onClose} footer={<Button onClick={() => { try { setService(table, Number(pax || 0)); onClose(); } catch (e) { setError(errorMessage(e)); } }}>Simpan</Button>}>
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">Meja yang sedang terisi pesanan tersimpan di tablet ini ditandai. Gunakan menu Meja & pesanan untuk membukanya. Mengganti meja tidak mengubah item/harga.</p>
      <label>Meja<select className={`${inputClass} mt-2`} value={table} disabled={cart.orderType !== 'dine_in'} onChange={(e) => setTable(e.target.value)}><option value="">Tanpa meja</option>{[...new Set([...tables, ...(cart.tableName ? [cart.tableName] : [])])].map((name) => { const occupied = saved.some((o) => o.id !== cart.savedId && o.tableName === name); return <option key={name} value={name} disabled={occupied}>{name}{occupied ? ' · Terisi' : ''}</option>; })}</select></label>
      {!tables.length && <p className="text-sm text-fg-muted">Owner dapat menambahkan meja di Pengaturan → Master operasional kasir.</p>}
      <label>Jumlah tamu (pax)<input className={`${inputClass} mt-2`} inputMode="numeric" value={pax} maxLength={3} onChange={(e) => setPax(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
      <ErrorNote>{error}</ErrorNote>
    </div>
  </Modal>;
}

export function TransferSheet({ onClose }: { onClose: () => void }) {
  const cart = useCart(); const saved = useSaved();
  const pos = useApp((s) => s.data?.settings.pos);
  const tables = pos?.tables ?? [];
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [target, setTarget] = useState('new'); const [table, setTable] = useState('');
  const [error, setError] = useState('');
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const all = count === cart.lines.reduce((a, b) => a + b.qty, 0);
  return <Modal open size="lg" title="Pindahkan pesanan" onClose={onClose} footer={<Button disabled={!count} onClick={async () => {
    if (all && !await confirmDialog({ title: 'Pindahkan seluruh item?', message: 'Seluruh item akan masuk ke pesanan tujuan. Pesanan sumber dikosongkan; tidak ada pembayaran yang dicatat.', confirmLabel: 'Pindahkan' })) return;
    try { const result = transferItems(quantities, target === 'new' ? null : target, target === 'new' ? table : ''); toast(`Item dipindahkan ke ${result.label}`); onClose(); } catch (e) { setError(errorMessage(e)); }
  }}>Pindahkan {count} item</Button>}>
    <div className="flex flex-col gap-3"><p className="text-sm text-fg-muted">Pilih jumlah item dan pesanan tujuan dengan tipe yang sama. Bila ada diskon, lepaskan dahulu lalu terapkan kembali pada pesanan yang sesuai.</p>
      <Button variant="outline" onClick={() => setQuantities(Object.fromEntries(cart.lines.map((l) => [l.key, l.qty])))}>Pilih semua item</Button>
      {cart.lines.map((l) => <label key={l.key} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3"><span><b>{l.name}</b><span className="block text-sm text-fg-muted">{l.options.map((o) => o.name).join(', ')} {l.note} · tersedia {l.qty}</span></span><input aria-label={`Jumlah pindah ${l.name}`} type="number" min={0} max={l.qty} className={`${inputClass} w-24`} value={quantities[l.key] ?? 0} onChange={(e) => setQuantities((s) => ({ ...s, [l.key]: Number(e.target.value) }))} /></label>)}
      <label>Pesanan tujuan<select className={`${inputClass} mt-2`} value={target} onChange={(e) => setTarget(e.target.value)}><option value="new">Pesanan baru</option>{saved.filter((o) => o.id !== cart.savedId && o.orderType === cart.orderType).map((o) => <option key={o.id} value={o.id}>{o.label}{o.tableName ? ` · ${o.tableName}` : ''}</option>)}</select></label>
      {target === 'new' && cart.orderType === 'dine_in' && <label>Meja tujuan<select className={`${inputClass} mt-2`} value={table} onChange={(e) => setTable(e.target.value)}><option value="">Tanpa meja</option>{tables.filter((t) => t !== cart.tableName && !saved.some((o) => o.tableName === t)).map((t) => <option key={t}>{t}</option>)}</select></label>}
      <ErrorNote>{error}</ErrorNote>
    </div>
  </Modal>;
}

export function CancellationSheet({ kind, title, onClose, onSubmit }: { kind: 'menu' | 'order'; title: string; onClose: () => void; onSubmit: (reason: string) => void }) {
  const pos = useApp((s) => s.data?.settings.pos);
  const reasons = pos?.cancellationReasons ?? [];
  const [reason, setReason] = useState(''); const [error, setError] = useState('');
  return <Modal open title={title} onClose={onClose} footer={<Button variant="danger" disabled={reason.trim().length < 3} onClick={() => { try { onSubmit(reason.trim()); } catch (e) { setError(errorMessage(e)); } }}>Batalkan</Button>}><div className="flex flex-col gap-3"><p>Pesanan belum dibayar. Pembatalan ini tidak mengubah stok atau transaksi lunas.</p><div className="flex flex-wrap gap-2">{reasons.filter((r) => r.kind === kind).map((r) => <Button key={r.text} variant="outline" onClick={() => setReason(r.text)}>{r.text}</Button>)}</div><input aria-label="Alasan pembatalan pesanan" className={inputClass} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (minimal 3 huruf)" /><ErrorNote>{error}</ErrorNote></div></Modal>;
}
