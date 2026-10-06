import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatNumber, formatRupiah, type Catalog, type Ingredient } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, Button, ErrorNote, Modal, Spinner, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { useApi } from './hooks';

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

export function RecipesPage() {
  const { data, error, loading, reload } = useApi<RecipeSummary[]>('/recipes');
  const catalog = useApi<Catalog>('/admin/catalog');
  const ingredients = useApi<Ingredient[]>('/ingredients?all=1');
  const [editing, setEditing] = useState<RecipeSummary | null>(null);

  return (
    <div className="p-4">
      <PageHeader title="Resep & HPP" subtitle="Takaran bahan per menu. Dipakai untuk memotong stok otomatis dan menghitung modal (HPP)." />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr>
                <th className="px-3 py-2">Menu</th>
                <th className="px-3 py-2 text-right">Harga</th>
                <th className="px-3 py-2 text-right">HPP dasar</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => (
                <tr key={r.productId} onClick={() => setEditing(r)} className="cursor-pointer hover:bg-surface-2">
                  <td className="px-3 py-3 font-semibold">
                    {r.name} {!r.lineCount && <Badge tone="amber">Belum ada resep</Badge>}
                  </td>
                  <td className="px-3 py-3 text-right tabular">{formatNumber(r.price)}</td>
                  <td className="px-3 py-3 text-right tabular">{formatNumber(r.cost)}</td>
                  <td className={cx('px-3 py-3 text-right font-semibold tabular', r.marginPct < 50 ? 'text-danger' : r.marginPct < 65 ? 'text-warning' : 'text-success')}>
                    {r.lineCount ? `${r.marginPct}%` : '-'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Pencil className="ml-auto size-4 text-fg-subtle" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const add = (optionId: string | null) => ingredients[0] && setLines((ls) => [...(ls ?? []), { optionId, ingredientId: ingredients[0].id, qty: 1 }]);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/recipes/${summary.productId}`, { method: 'PUT', body: { lines: lines!.filter((l) => l.qty > 0) } });
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
                <select value={l.ingredientId} onChange={(e) => update(i, { ingredientId: e.target.value })} className={cx(inputClass, 'min-w-0 basis-full sm:flex-1')}>
                  {ingredients.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
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
