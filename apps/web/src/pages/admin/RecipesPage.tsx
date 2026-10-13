import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, formatRupiah, STATION_LABEL, type Catalog, type Ingredient } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { SearchSelect } from '../../components/SearchSelect';
import { Badge, Button, Empty, ErrorNote, Modal, Spinner, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { useApi } from './hooks';
import { PillNav, SearchBox, matches } from './PillNav';

interface RecipeSummary {
  productId: string;
  name: string;
  price: number;
  cost: number;
  marginPct: number;
  lineCount: number;
}

interface RecipeLine {
  optionId: string | null;
  ingredientId: string;
  qty: number;
}

type RecipeStatus = 'all' | 'missing' | 'done';
const NO_CATEGORY = 'lainnya';

export function RecipesPage() {
  const { data, error, loading, reload } = useApi<RecipeSummary[]>('/recipes');
  const catalog = useApi<Catalog>('/admin/catalog');
  const ingredients = useApi<Ingredient[]>('/ingredients?all=1');
  const [editing, setEditing] = useState<RecipeSummary | null>(null);
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<RecipeStatus>('all');
  const [search, setSearch] = useState('');

  // Kategori tiap menu diambil dari katalog; urutan kategori mengikuti urutan di layar kasir.
  const categoryOf = useMemo(() => new Map((catalog.data?.products ?? []).map((p) => [p.id, p.categoryId])), [catalog.data]);
  const categories = useMemo(() => {
    const used = new Set((data ?? []).map((r) => categoryOf.get(r.productId) ?? NO_CATEGORY));
    const named = (catalog.data?.categories ?? []).filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
    return used.has(NO_CATEGORY) && catalog.data ? [...named, { id: NO_CATEGORY, name: 'Lainnya' }] : named;
  }, [data, catalog.data, categoryOf]);

  const byStatus = (data ?? []).filter((r) => (status === 'all' || (status === 'missing') === !r.lineCount) && matches(r.name, search));
  const inCat = (id: string) => byStatus.filter((r) => (categoryOf.get(r.productId) ?? NO_CATEGORY) === id);
  const groups = (cat === 'all' ? categories : categories.filter((c) => c.id === cat)).map((c) => ({ ...c, rows: inCat(c.id) })).filter((g) => g.rows.length);
  const total = data?.length ?? 0;
  const done = (data ?? []).filter((r) => r.lineCount).length;

  return (
    <div className="p-4">
      <PageHeader title="Resep & HPP" subtitle="Takaran bahan per menu. Dipakai untuk memotong stok otomatis dan menghitung modal (HPP)." />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && (
        <>
          <section className="tile mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <div className="min-w-56 flex-1">
              <p className="text-sm text-fg-muted">
                <b className="text-lg text-fg tabular">{done}</b> dari <b className="text-fg tabular">{total}</b> menu sudah punya resep
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Menu yang sudah punya resep" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="pill-group" role="group" aria-label="Status resep">
              {([['all', 'Semua'], ['missing', `Belum ada (${total - done})`], ['done', `Sudah ada (${done})`]] as [RecipeStatus, string][]).map(([v, label]) => (
                <button key={v} className="pill" aria-pressed={status === v} onClick={() => setStatus(v)}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div className="mb-3 flex">
            <SearchBox value={search} onChange={setSearch} label="Cari menu" placeholder="Cari nama menu..." className="max-w-md" />
          </div>
          <PillNav
            label="Kategori menu"
            className="mb-3"
            value={cat}
            onChange={setCat}
            options={[{ value: 'all', label: 'Semua kategori', count: byStatus.length }, ...categories.map((c) => ({ value: c.id, label: c.name, count: inCat(c.id).length }))]}
          />

          {!groups.length ? (
            <div className="tile">
              <Empty title="Tidak ada menu yang cocok">
                <p className="text-sm">Coba kategori, status, atau kata kunci lain.</p>
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[440px] text-sm">
                <thead className="bg-surface-2 text-left text-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5">Menu</th>
                    <th className="px-4 py-2.5 text-right">Harga</th>
                    <th className="px-4 py-2.5 text-right">HPP dasar</th>
                    <th className="px-4 py-2.5 text-right">Margin</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell" />
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.id} className="divide-y divide-line border-t border-line">
                    <tr className="bg-surface-2/60">
                      <th colSpan={5} scope="rowgroup" className="px-4 py-2 text-left text-xs font-bold tracking-wide text-fg-muted uppercase">
                        {g.name}
                        <span className="ml-2 font-semibold tracking-normal normal-case">
                          {g.rows.filter((r) => r.lineCount).length} dari {g.rows.length} punya resep
                        </span>
                      </th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.productId} onClick={() => setEditing(r)} className="cursor-pointer hover:bg-surface-2">
                        <td className="px-4 py-3 font-semibold">
                          {r.name} {!r.lineCount && <Badge tone="amber">Belum ada resep</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right tabular">{formatNumber(r.price)}</td>
                        <td className="px-4 py-3 text-right tabular">{r.lineCount ? formatNumber(r.cost) : '-'}</td>
                        <td className={cx('px-4 py-3 text-right font-semibold tabular', !r.lineCount ? 'text-fg-subtle' : r.marginPct < 50 ? 'text-danger' : r.marginPct < 65 ? 'text-warning' : 'text-success')}>
                          {r.lineCount ? `${r.marginPct}%` : '-'}
                        </td>
                        <td className="hidden px-4 py-3 text-right sm:table-cell">
                          <button aria-label={`Ubah resep ${r.name}`} className="ml-auto grid size-9 place-items-center rounded-lg border border-line text-fg-subtle">
                            <Pencil className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </>
      )}
      {editing && catalog.data && ingredients.data && (
        <RecipeEditor summary={editing} catalog={catalog.data} ingredients={ingredients.data.filter((i) => i.active)} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  );
}

function RecipeEditor({
  summary,
  catalog,
  ingredients,
  onClose,
  onSaved,
}: {
  summary: RecipeSummary;
  catalog: Catalog;
  ingredients: Ingredient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lines, setLines] = useState<RecipeLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const product = catalog.products.find((p) => p.id === summary.productId);
  const options = (product?.optionGroupIds ?? []).flatMap((gid) => {
    const g = catalog.optionGroups.find((x) => x.id === gid);
    return (g?.options ?? []).filter((o) => o.active).map((o) => ({ id: o.id, label: `${g!.name}: ${o.name}` }));
  });

  useEffect(() => {
    api<RecipeLine[]>(`/recipes/${summary.productId}`)
      .then((rows) => setLines(rows.map((r) => ({ optionId: r.optionId, ingredientId: r.ingredientId, qty: r.qty }))))
      .catch((e) => setError(errorMessage(e)));
  }, [summary.productId]);

  const cost = (optionId: string | null) =>
    (lines ?? []).filter((l) => l.optionId === optionId).reduce((s, l) => s + l.qty * (ingredients.find((i) => i.id === l.ingredientId)?.costPerUnit ?? 0), 0);
  const baseCost = cost(null);

  const update = (idx: number, patch: Partial<RecipeLine>) => setLines((ls) => ls!.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  // Baris baru dimulai kosong dan langsung membuka pencarian bahan.
  const add = (optionId: string | null) => ingredients.length && setLines((ls) => [...(ls ?? []), { optionId, ingredientId: '', qty: 1 }]);
  const ingredientOptions = useMemo(() => ingredients.map((x) => ({ value: x.id, label: x.name, hint: x.unit, group: STATION_LABEL[x.station] })), [ingredients]);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/recipes/${summary.productId}`, { method: 'PUT', body: { lines: lines!.filter((l) => l.ingredientId && l.qty > 0) } });
      toast('Resep disimpan');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const section = (title: string, optionId: string | null, hint?: string) => {
    const idxs = (lines ?? []).map((l, i) => [l, i] as const).filter(([l]) => l.optionId === optionId);
    return (
      <div key={optionId ?? 'base'} className="rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-semibold">{title}</p>
          <span className="text-sm text-fg-muted">HPP {formatRupiah(cost(optionId))}</span>
        </div>
        {hint && <p className="mb-2 text-xs text-fg-muted">{hint}</p>}
        <div className="flex flex-col gap-2">
          {idxs.map(([l, i]) => {
            const ing = ingredients.find((x) => x.id === l.ingredientId);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                {/* HP: nama bahan satu baris penuh, takaran di bawahnya. */}
                <SearchSelect
                  label="Bahan"
                  placeholder="Pilih bahan..."
                  searchPlaceholder="Ketik nama bahan..."
                  autoOpen={!l.ingredientId}
                  value={l.ingredientId}
                  onChange={(v) => update(i, { ingredientId: v })}
                  options={ingredientOptions}
                  className="min-w-0 basis-full sm:flex-1 sm:basis-0"
                />
                <input
                  inputMode="decimal"
                  value={String(l.qty)}
                  onChange={(e) => update(i, { qty: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                  className={cx(inputClass, 'max-w-24 shrink-0 text-right')}
                  aria-label="Takaran"
                />
                <span className="w-12 text-sm text-fg-muted">{ing?.unit}</span>
                <button aria-label="Hapus bahan" onClick={() => setLines((ls) => ls!.filter((_, j) => j !== i))} className="ml-auto grid size-11 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-5" />
                </button>
              </div>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" className="mt-1" icon={<Plus className="size-4" />} onClick={() => add(optionId)}>
          Tambah bahan
        </Button>
      </div>
    );
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Resep ${summary.name}`}
      footer={
        <>
          <div className="flex-1 text-sm">
            <p>
              Harga {formatRupiah(summary.price)} · HPP dasar <b>{formatRupiah(baseCost)}</b>
            </p>
            <p className="text-fg-muted">Margin {summary.price ? Math.round(((summary.price - baseCost) / summary.price) * 100) : 0}%</p>
          </div>
          <Button size="lg" loading={busy} disabled={!lines} onClick={submit}>
            Simpan resep
          </Button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {!lines ? (
        <Spinner className="mx-auto my-6" />
      ) : (
        <div className="flex flex-col gap-3">
          {!ingredients.length && <ErrorNote>Tambahkan bahan dulu di menu Stok.</ErrorNote>}
          {section('Resep dasar', null, 'Bahan yang selalu terpakai setiap kali menu ini terjual.')}
          {options.map((o) => section(`+ ${o.label}`, o.id, 'Bahan tambahan bila pilihan ini dipilih.'))}
        </div>
      )}
    </Modal>
  );
}
