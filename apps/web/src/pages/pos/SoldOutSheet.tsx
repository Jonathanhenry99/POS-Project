import { PackageX, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber, type Catalog, type Product } from '@mourden/shared';
import { confirmDialog } from '../../components/feedback';
import { Button, Empty, Modal, cx } from '../../components/ui';

/**
 * Daftar menu dengan sakelar "Habis". Menu yang ditandai habis langsung berlabel HABIS di layar kasir
 * dan tidak bisa dipesan sampai ditandai tersedia lagi. Tersimpan di tablet dan ikut tersinkron.
 */
export function SoldOutSheet({ catalog, onSet, onClose }: { catalog: Catalog; onSet: (product: Product, soldOut: boolean) => Promise<void>; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const out = catalog.products.filter((p) => p.soldOut);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.categories
      .map((c) => ({ category: c, products: catalog.products.filter((p) => p.categoryId === c.id && (!q || p.name.toLowerCase().includes(q)) && (!only || p.soldOut)) }))
      .filter((g) => g.products.length);
  }, [catalog, query, only]);

  const set = async (p: Product, v: boolean) => {
    setBusy(p.id);
    try {
      await onSet(p, v);
    } finally {
      setBusy(null);
    }
  };
  const reset = async () => {
    if (!(await confirmDialog({ title: 'Semua menu tersedia lagi?', message: `${out.length} menu yang ditandai habis akan bisa dipesan kembali.`, confirmLabel: 'Tersedia semua' }))) return;
    for (const p of out) await onSet(p, false);
  };

  return (
    <Modal open size="lg" onClose={onClose} title="Menu habis">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3">
          <PackageX className={cx('size-5 shrink-0', out.length ? 'text-danger' : 'text-fg-muted')} />
          <p className="min-w-0 flex-1 text-sm">
            {out.length ? (
              <>
                <b>{out.length} menu ditandai habis</b>: {out.slice(0, 4).map((p) => p.name).join(', ')}
                {out.length > 4 && ` +${out.length - 4} lainnya`}
              </>
            ) : (
              'Semua menu tersedia. Nyalakan sakelar pada menu yang habis supaya tidak terpesan.'
            )}
          </p>
          {out.length > 0 && (
            <Button size="sm" variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => void reset()}>
              Tersedia semua
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <label className="flex h-12 min-w-0 flex-1 items-center rounded-2xl border border-line bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12">
            <Search className="ml-3 size-5 shrink-0 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari menu…" aria-label="Cari menu untuk ditandai habis" className="h-full min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-fg-subtle" />
          </label>
          <button onClick={() => setOnly((v) => !v)} aria-pressed={only} className={cx('press h-12 shrink-0 rounded-2xl border px-4 text-sm font-semibold', only ? 'border-danger/40 bg-danger/8 text-danger' : 'border-line bg-surface text-fg-muted')}>
            Habis saja
          </button>
        </div>
        {!groups.length && <Empty icon={<Search className="size-8" />} title={only ? 'Belum ada menu yang ditandai habis' : 'Tidak ada menu yang cocok'} />}
        <div className="flex max-h-[52vh] flex-col gap-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <section key={g.category.id}>
              <p className="mb-1.5 text-xs font-bold tracking-wider text-fg-subtle uppercase">{g.category.name}</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.products.map((p) => (
                  <li key={p.id}>
                    <button
                      role="switch"
                      aria-checked={p.soldOut}
                      aria-label={`${p.name} habis`}
                      disabled={busy === p.id}
                      onClick={() => void set(p, !p.soldOut)}
                      className={cx('press flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left', p.soldOut ? 'border-danger/40 bg-danger/6' : 'border-line bg-surface')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cx('block truncate font-semibold', p.soldOut && 'text-danger')}>{p.name}</span>
                        <span className="text-xs text-fg-muted">{p.soldOut ? 'Habis · tidak bisa dipesan' : formatNumber(p.price)}</span>
                      </span>
                      <span className={cx('relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200', p.soldOut ? 'bg-danger' : 'bg-surface-3')}>
                        <span className={cx('absolute top-1 size-6 rounded-full bg-white shadow transition-all duration-200', p.soldOut ? 'left-7' : 'left-1')} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
