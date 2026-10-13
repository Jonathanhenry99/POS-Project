import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Catalog, PosSettings } from '@mourden/shared';
import { SearchSelect } from '../../components/SearchSelect';
import { Button, Card, Empty, cx, inputClass } from '../../components/ui';
import { useApi } from './hooks';
import { PillNav, SearchBox, matches } from './PillNav';

const EMPTY: PosSettings = { tables: [], notes: [], cancellationReasons: [], productStations: {} };
type Station = 'bar' | 'kitchen' | 'umum';

/** Master operasional kasir: tiap daftar di kartunya sendiri. Disimpan bersama pengaturan lain lewat tombol Simpan. */
export function PosMasterCard({ value = EMPTY, onChange }: { value?: PosSettings; onChange: (value: PosSettings) => void }) {
  const { data: catalog } = useApi<Catalog>('/admin/catalog');
  const set = (patch: Partial<PosSettings>) => onChange({ ...value, ...patch });
  return (
    <>
      <Card title="Daftar meja">
        <Rows empty="Belum ada meja. Tanpa daftar meja, kasir mengetik nama pelanggan saja.">
          {value.tables.map((name, i) => (
            <Row key={i} onRemove={() => set({ tables: value.tables.filter((_, j) => j !== i) })} removeLabel={`Hapus ${name || `meja ${i + 1}`}`}>
              <input aria-label={`Nama meja ${i + 1}`} className={cx(inputClass, 'min-w-0 flex-1')} maxLength={40} value={name} onChange={(e) => set({ tables: value.tables.map((n, j) => (j === i ? e.target.value : n)) })} />
            </Row>
          ))}
        </Rows>
        <AddButton disabled={value.tables.length >= 100} onClick={() => set({ tables: [...value.tables, `Meja ${value.tables.length + 1}`] })}>
          Tambah meja
        </AddButton>
      </Card>

      <Card title="Alasan pembatalan">
        <p className="mb-3 text-sm text-fg-muted">Pilihan cepat saat kasir menghapus item, membatalkan pesanan, atau void.</p>
        <Rows empty="Belum ada alasan. Kasir tetap bisa mengetik alasan sendiri.">
          {value.cancellationReasons.map((r, i) => (
            <Row key={i} onRemove={() => set({ cancellationReasons: value.cancellationReasons.filter((_, j) => j !== i) })} removeLabel={`Hapus alasan ${i + 1}`}>
              <input aria-label={`Alasan ${i + 1}`} className={cx(inputClass, 'min-w-0 basis-full sm:flex-1 sm:basis-0')} maxLength={200} value={r.text} onChange={(e) => set({ cancellationReasons: value.cancellationReasons.map((v, j) => (j === i ? { ...v, text: e.target.value } : v)) })} />
              <SearchSelect label={`Jenis alasan ${i + 1}`} className="min-w-0 flex-1 sm:max-w-56" value={r.kind} onChange={(kind) => set({ cancellationReasons: value.cancellationReasons.map((v, j) => (j === i ? { ...v, kind } : v)) })} options={REASON_KINDS} />
            </Row>
          ))}
        </Rows>
        <AddButton disabled={value.cancellationReasons.length >= 100} onClick={() => set({ cancellationReasons: [...value.cancellationReasons, { text: '', kind: 'void' }] })}>
          Tambah alasan
        </AddButton>
      </Card>

      <Card title="Template catatan menu">
        <p className="mb-3 text-sm text-fg-muted">Catatan cepat di keranjang, misalnya “Less sugar”. Bisa dibatasi untuk satu kategori.</p>
        <Rows empty="Belum ada template. Kasir tetap bisa mengetik catatan sendiri.">
          {value.notes.map((n, i) => (
            <Row key={i} onRemove={() => set({ notes: value.notes.filter((_, j) => j !== i) })} removeLabel={`Hapus catatan ${i + 1}`}>
              <input aria-label={`Catatan ${i + 1}`} className={cx(inputClass, 'min-w-0 basis-full sm:flex-1 sm:basis-0')} maxLength={200} value={n.text} onChange={(e) => set({ notes: value.notes.map((v, j) => (j === i ? { ...v, text: e.target.value } : v)) })} />
              <SearchSelect label={`Kategori catatan ${i + 1}`} className="min-w-0 flex-1 sm:max-w-56" value={n.categoryId ?? ''} onChange={(id) => set({ notes: value.notes.map((v, j) => (j === i ? { ...v, categoryId: id || null } : v)) })} options={[{ value: '', label: 'Semua kategori' }, ...(catalog?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            </Row>
          ))}
        </Rows>
        <AddButton disabled={value.notes.length >= 100} onClick={() => set({ notes: [...value.notes, { text: '', categoryId: null }] })}>
          Tambah catatan
        </AddButton>
      </Card>

      <CheckerCard catalog={catalog} stations={value.productStations} onChange={(productStations) => set({ productStations })} />
    </>
  );
}

/** Tujuan checker (bar/dapur) per menu, dipilih per kategori supaya tidak menggulir seluruh menu. */
function CheckerCard({ catalog, stations, onChange }: { catalog: Catalog | null; stations: PosSettings['productStations']; onChange: (v: PosSettings['productStations']) => void }) {
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const products = (catalog?.products ?? []).filter((p) => p.active && matches(p.name, search));
  const categories = (catalog?.categories ?? []).filter((c) => products.some((p) => p.categoryId === c.id));
  const list = products.filter((p) => cat === 'all' || p.categoryId === cat);
  // Satu kategori biasanya satu tujuan: sediakan jalan pintas untuk semua menu yang sedang tampil.
  const setAll = (station: Station) => onChange({ ...stations, ...Object.fromEntries(list.map((p) => [p.id, station])) });
  return (
    <Card title="Tujuan checker per menu">
      <p className="mb-3 text-sm text-fg-muted">Menentukan checker pesanan dicetak ke bar atau dapur (dihubungkan dengan profil printer di tablet). Menu tanpa pilihan mengikuti Umum.</p>
      <SearchBox value={search} onChange={setSearch} label="Cari menu" placeholder="Cari nama menu..." className="mb-2" />
      <PillNav label="Kategori menu" value={cat} onChange={setCat} options={[{ value: 'all', label: 'Semua', count: products.length }, ...categories.map((c) => ({ value: c.id, label: c.name, count: products.filter((p) => p.categoryId === c.id).length }))]} />
      {!!list.length && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="text-fg-muted">Atur {list.length} menu yang tampil ke:</span>
          {(['umum', 'bar', 'kitchen'] as Station[]).map((st) => (
            <Button key={st} size="sm" variant="outline" onClick={() => setAll(st)}>
              {STATION_NAME[st]}
            </Button>
          ))}
        </div>
      )}
      <div className="mt-2 max-h-96 overflow-y-auto">
        {list.map((p) => (
          <div key={p.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 last:border-0">
            <span className="min-w-0 truncate">{p.name}</span>
            <SearchSelect label={`Tujuan checker ${p.name}`} className="max-w-36 shrink-0" value={stations[p.id] ?? 'umum'} onChange={(st) => onChange({ ...stations, [p.id]: st })} options={STATION_OPTIONS} />
          </div>
        ))}
        {catalog && !list.length && <Empty title="Tidak ada menu yang cocok" />}
      </div>
    </Card>
  );
}

const STATION_NAME: Record<Station, string> = { umum: 'Umum', bar: 'Bar', kitchen: 'Dapur' };
const STATION_OPTIONS = (['umum', 'bar', 'kitchen'] as Station[]).map((st) => ({ value: st, label: STATION_NAME[st] }));
const REASON_KINDS: { value: PosSettings['cancellationReasons'][number]['kind']; label: string }[] = [
  { value: 'menu', label: 'Item menu' },
  { value: 'order', label: 'Pesanan tersimpan' },
  { value: 'void', label: 'Transaksi lunas (void)' },
];

function Rows({ children, empty }: { children: ReactNode[]; empty: string }) {
  if (!children.length) return <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">{empty}</p>;
  return <div className="mb-3 flex flex-col gap-2">{children}</div>;
}

function Row({ children, onRemove, removeLabel }: { children: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <button type="button" aria-label={removeLabel} onClick={onRemove} className="grid size-12 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-danger/10 hover:text-danger">
        <Trash2 className="size-5" />
      </button>
    </div>
  );
}

function AddButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" icon={<Plus className="size-5" />} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
