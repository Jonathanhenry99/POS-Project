import type { Catalog, PosSettings } from '@mourden/shared';
import { Button, Card, inputClass } from '../../components/ui';
import { useApi } from './hooks';

const EMPTY: PosSettings = { tables: [], notes: [], cancellationReasons: [], productStations: {} };

export function PosMasterCard({ value = EMPTY, onChange }: { value?: PosSettings; onChange: (value: PosSettings) => void }) {
  const { data: catalog } = useApi<Catalog>('/admin/catalog');
  const set = (patch: Partial<PosSettings>) => onChange({ ...value, ...patch });
  return <Card title="Master operasional kasir">
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">Disimpan bersama pengaturan toko dan diterima tablet saat sinkronisasi menu. Pesanan tersimpan dan pemakaian meja berlaku di tablet masing-masing.</p>
      <div><p className="mb-2 font-semibold">Daftar meja</p>
        {value.tables.map((name, i) => <div key={i} className="mb-2 flex gap-2"><input aria-label={`Nama meja ${i + 1}`} className={inputClass} maxLength={40} value={name} onChange={(e) => set({ tables: value.tables.map((n, index) => index === i ? e.target.value : n) })} /><Button variant="outline" onClick={() => set({ tables: value.tables.filter((_, index) => index !== i) })}>Hapus</Button></div>)}
        <Button variant="outline" disabled={value.tables.length >= 100} onClick={() => set({ tables: [...value.tables, `Meja ${value.tables.length + 1}`] })}>Tambah meja</Button>
      </div>
      <div><p className="mb-2 font-semibold">Template catatan menu</p>
        {value.notes.map((n, i) => <div key={i} className="mb-2 flex flex-wrap gap-2"><input aria-label={`Catatan ${i + 1}`} className={`${inputClass} flex-1`} maxLength={200} value={n.text} onChange={(e) => set({ notes: value.notes.map((v, j) => j === i ? { ...v, text: e.target.value } : v) })} /><select aria-label={`Kategori catatan ${i + 1}`} className={`${inputClass} w-auto`} value={n.categoryId ?? ''} onChange={(e) => set({ notes: value.notes.map((v, j) => j === i ? { ...v, categoryId: e.target.value || null } : v) })}><option value="">Semua kategori</option>{catalog?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Button variant="outline" onClick={() => set({ notes: value.notes.filter((_, j) => j !== i) })}>Hapus</Button></div>)}
        <Button variant="outline" disabled={value.notes.length >= 100} onClick={() => set({ notes: [...value.notes, { text: '', categoryId: null }] })}>Tambah catatan</Button>
      </div>
      <div><p className="mb-2 font-semibold">Alasan pembatalan</p>
        {value.cancellationReasons.map((r, i) => <div key={i} className="mb-2 flex gap-2"><input aria-label={`Alasan ${i + 1}`} className={inputClass} maxLength={200} value={r.text} onChange={(e) => set({ cancellationReasons: value.cancellationReasons.map((v, j) => j === i ? { ...v, text: e.target.value } : v) })} /><select aria-label={`Jenis alasan ${i + 1}`} className={`${inputClass} w-auto`} value={r.kind} onChange={(e) => set({ cancellationReasons: value.cancellationReasons.map((v, j) => j === i ? { ...v, kind: e.target.value as typeof v.kind } : v) })}><option value="menu">Item menu</option><option value="order">Pesanan tersimpan</option><option value="void">Transaksi lunas (void)</option></select><Button variant="outline" onClick={() => set({ cancellationReasons: value.cancellationReasons.filter((_, j) => j !== i) })}>Hapus</Button></div>)}
        <Button variant="outline" disabled={value.cancellationReasons.length >= 100} onClick={() => set({ cancellationReasons: [...value.cancellationReasons, { text: '', kind: 'void' }] })}>Tambah alasan</Button>
      </div>
      <div><p className="mb-2 font-semibold">Tujuan checker per menu</p><p className="mb-2 text-sm text-fg-muted">Hubungkan station dengan profil printer di tablet. Menu tanpa pilihan mengikuti Umum.</p>
        <div className="max-h-72 overflow-y-auto">{catalog?.products.filter((p) => p.active).map((p) => <label key={p.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2"><span>{p.name}</span><select className={`${inputClass} w-36`} value={value.productStations[p.id] ?? 'umum'} onChange={(e) => set({ productStations: { ...value.productStations, [p.id]: e.target.value as 'bar' | 'kitchen' | 'umum' } })}><option value="umum">Umum</option><option value="bar">Bar</option><option value="kitchen">Dapur</option></select></label>)}</div>
      </div>
    </div>
  </Card>;
}
