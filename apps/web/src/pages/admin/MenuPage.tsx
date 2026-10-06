import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber, type Catalog, type Category, type OptionGroup, type Product } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, Button, ErrorNote, Field, Modal, MoneyInput, Segmented, Spinner, TextInput, Toggle, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { refreshBootstrap } from '../../lib/sync';
import { PageHeader } from './AdminRoutes';
import { useApi } from './hooks';

async function saved(reload: () => void, msg: string) {
  reload();
  toast(msg);
  // Tablet kasir: perbarui menu di layar kasir.
  void refreshBootstrap();
}

export function MenuPage() {
  const { data, error, loading, reload } = useApi<Catalog>('/admin/catalog');
  const [tab, setTab] = useState<'produk' | 'kategori' | 'opsi'>('produk');
  return (
    <div className="p-4">
      <PageHeader title="Menu" subtitle="Produk, kategori, varian & add-on" />
      <div className="mb-4 max-w-md">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'produk', label: 'Produk' },
            { value: 'kategori', label: 'Kategori' },
            { value: 'opsi', label: 'Varian & add-on' },
          ]}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && tab === 'produk' && <Products catalog={data} reload={reload} />}
      {data && tab === 'kategori' && <Categories catalog={data} reload={reload} />}
      {data && tab === 'opsi' && <Groups catalog={data} reload={reload} />}
    </div>
  );
}

// ---------- Produk ----------

function Products({ catalog, reload }: { catalog: Catalog; reload: () => void }) {
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [cat, setCat] = useState('all');
  const list = catalog.products.filter((p) => cat === 'all' || p.categoryId === cat);
  const catName = (id: string) => catalog.categories.find((c) => c.id === id)?.name ?? '-';
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={cx(inputClass, 'h-11 max-w-56')}>
          <option value="all">Semua kategori</option>
          {catalog.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button icon={<Plus className="size-5" />} disabled={!catalog.categories.length} onClick={() => setEditing('new')}>
          Tambah produk
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {p.name}
                    {!p.active && <Badge>Nonaktif</Badge>}
                    {p.soldOut && <Badge tone="red">Habis</Badge>}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {catName(p.categoryId)}
                    {p.optionGroupIds.length > 0 && ` · ${p.optionGroupIds.map((g) => catalog.optionGroups.find((x) => x.id === g)?.name).filter(Boolean).join(', ')}`}
                  </p>
                </div>
                <span className="font-semibold tabular">{formatNumber(p.price)}</span>
                <Pencil className="size-4 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {editing && <ProductForm catalog={catalog} product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function ProductForm({ catalog, product, onClose, onSaved }: { catalog: Catalog; product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? catalog.categories[0]?.id ?? '',
    price: product?.price ?? 0,
    sku: product?.sku ?? '',
    active: product?.active ?? true,
    soldOut: product?.soldOut ?? false,
    optionGroupIds: product?.optionGroupIds ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (product) await api(`/products/${product.id}`, { method: 'PATCH', body: form });
      else await api('/products', { method: 'POST', body: form });
      await saved(onSaved, 'Produk disimpan');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Ubah produk' : 'Produk baru'}
      footer={
        <Button className="flex-1" size="lg" loading={busy} disabled={!form.name.trim() || !form.categoryId} onClick={submit}>
          Simpan
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nama">{(id) => <TextInput id={id} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori">
            {(id) => (
              <select id={id} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputClass}>
                {catalog.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Harga dasar">{(id) => <MoneyInput id={id} value={form.price} onChange={(n) => set('price', n)} />}</Field>
        </div>
        <Field label="Kode / SKU (opsional)">{(id) => <TextInput id={id} value={form.sku} onChange={(e) => set('sku', e.target.value)} />}</Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-fg">Varian & add-on yang berlaku</p>
          <div className="flex flex-wrap gap-2">
            {catalog.optionGroups.map((g) => {
              const on = form.optionGroupIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => set('optionGroupIds', on ? form.optionGroupIds.filter((x) => x !== g.id) : [...form.optionGroupIds, g.id])}
                  className={cx('h-11 rounded-xl border-2 px-3 text-sm font-semibold', on ? 'border-primary bg-primary/8' : 'border-line')}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Aktif" description="Produk nonaktif tidak muncul di layar kasir." />
        <Toggle checked={form.soldOut} onChange={(v) => set('soldOut', v)} label="Habis" description="Tampil di kasir tapi tidak bisa dipesan." />
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

// ---------- Kategori ----------

function Categories({ catalog, reload }: { catalog: Catalog; reload: () => void }) {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const count = (id: string) => catalog.products.filter((p) => p.categoryId === id && p.active).length;
  return (
    <>
      <Button className="mb-3" icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>
        Tambah kategori
      </Button>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {catalog.categories.map((c) => (
          <li key={c.id}>
            <button onClick={() => setEditing(c)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-2">
              <span className="font-semibold">
                {c.name} {!c.active && <Badge>Nonaktif</Badge>}
              </span>
              <span className="text-sm text-fg-muted">
                {count(c.id)} produk · urutan {c.sort}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing && <CategoryForm category={editing === 'new' ? null : editing} nextSort={catalog.categories.length} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function CategoryForm({ category, nextSort, onClose, onSaved }: { category: Category | null; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [sort, setSort] = useState(String(category?.sort ?? nextSort));
  const [active, setActive] = useState(category?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    try {
      const body = { name, sort: parseInt(sort || '0', 10), active };
      if (category) await api(`/categories/${category.id}`, { method: 'PATCH', body });
      else await api('/categories', { method: 'POST', body });
      await saved(onSaved, 'Kategori disimpan');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal open size="sm" onClose={onClose} title={category ? 'Ubah kategori' : 'Kategori baru'} footer={<Button className="flex-1" loading={busy} disabled={!name.trim()} onClick={submit}>Simpan</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Nama">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <Field label="Urutan tampil" hint="Angka kecil tampil lebih dulu di layar kasir.">
          {(id) => <TextInput id={id} inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value.replace(/\D/g, ''))} />}
        </Field>
        <Toggle checked={active} onChange={setActive} label="Aktif" />
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

// ---------- Grup opsi ----------

function Groups({ catalog, reload }: { catalog: Catalog; reload: () => void }) {
  const [editing, setEditing] = useState<OptionGroup | 'new' | null>(null);
  return (
    <>
      <Button className="mb-3" icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>
        Tambah grup
      </Button>
      <div className="grid gap-3 md:grid-cols-2">
        {catalog.optionGroups.map((g) => (
          <button key={g.id} onClick={() => setEditing(g)} className="rounded-2xl border border-line bg-surface p-4 text-left hover:bg-surface-2">
            <p className="flex items-center gap-2 font-semibold">
              {g.name}
              <Badge tone="blue">{g.multi ? 'Pilih banyak' : 'Pilih satu'}</Badge>
              {g.required && <Badge tone="amber">Wajib</Badge>}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {g.options
                .filter((o) => o.active)
                .map((o) => (o.priceDelta ? `${o.name} (+${formatNumber(o.priceDelta)})` : o.name))
                .join(' · ')}
            </p>
          </button>
        ))}
      </div>
      {editing && <GroupForm group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function GroupForm({ group, onClose, onSaved }: { group: OptionGroup | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [multi, setMulti] = useState(group?.multi ?? false);
  const [required, setRequired] = useState(group?.required ?? false);
  const [options, setOptions] = useState(() =>
    (group?.options.filter((o) => o.active) ?? [{ id: undefined as string | undefined, name: '', priceDelta: 0 }]).map((o) => ({ id: o.id as string | undefined, name: o.name, priceDelta: o.priceDelta })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = useMemo(() => name.trim() && options.length > 0 && options.every((o) => o.name.trim()), [name, options]);

  const submit = async () => {
    setBusy(true);
    try {
      const body = { name, multi, required, options: options.map((o) => ({ ...o, active: true })) };
      if (group) await api(`/option-groups/${group.id}`, { method: 'PATCH', body });
      else await api('/option-groups', { method: 'POST', body });
      await saved(onSaved, 'Grup disimpan');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={group ? 'Ubah grup' : 'Grup baru'} footer={<Button className="flex-1" size="lg" loading={busy} disabled={!valid} onClick={submit}>Simpan</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Nama grup" hint="Contoh: Ukuran, Suhu, Tambahan">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <Toggle checked={multi} onChange={setMulti} label="Boleh pilih lebih dari satu" description="Aktifkan untuk add-on (extra shot, topping)." />
        <Toggle checked={required} onChange={setRequired} label="Wajib dipilih" description="Pilihan pertama otomatis terpilih di kasir." />
        <div>
          <p className="mb-2 text-sm font-semibold">Pilihan & tambahan harga</p>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput value={o.name} placeholder="Nama pilihan" onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <div className="w-40 shrink-0">
                  <MoneyInput value={o.priceDelta} onChange={(n) => setOptions((list) => list.map((x, j) => (j === i ? { ...x, priceDelta: n } : x)))} />
                </div>
                <button aria-label="Hapus pilihan" disabled={options.length === 1} onClick={() => setOptions((list) => list.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30">
                  <Trash2 className="size-5" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-2" icon={<Plus className="size-5" />} onClick={() => setOptions((l) => [...l, { id: undefined, name: '', priceDelta: 0 }])}>
            Tambah pilihan
          </Button>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
