import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { formatNumber, type Catalog, type Product } from '@mourden/shared';
import { cx } from '../../components/ui';
import type { CartLine } from '../../lib/pos';

export function ProductGrid({
  catalog,
  lines,
  onPick,
  onLongPress,
}: {
  catalog: Catalog;
  lines: CartLine[];
  onPick: (p: Product) => void;
  onLongPress: (p: Product) => void;
}) {
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.products.filter((p) => (q ? p.name.toLowerCase().includes(q) || p.sku.toLowerCase() === q : category === 'all' || p.categoryId === category));
  }, [catalog.products, category, query]);

  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    return m;
  }, [lines]);

  const chip = (active: boolean) =>
    cx('h-11 shrink-0 rounded-xl px-4 text-sm font-semibold whitespace-nowrap', active ? 'bg-brand-900 text-white' : 'bg-white text-stone-700');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 p-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari menu…"
            className="h-11 w-full rounded-xl border border-stone-200 bg-white pr-11 pl-10 outline-none focus:border-brand-500"
          />
          {query && (
            <button aria-label="Hapus pencarian" onClick={() => setQuery('')} className="absolute top-0 right-0 grid size-11 place-items-center text-stone-500">
              <X className="size-5" />
            </button>
          )}
        </div>
        {!query && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <button className={chip(category === 'all')} onClick={() => setCategory('all')}>
              Semua
            </button>
            {catalog.categories.map((c) => (
              <button key={c.id} className={chip(category === c.id)} onClick={() => setCategory(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
          {products.map((p) => (
            <ProductTile key={p.id} product={p} qty={qtyInCart.get(p.id) ?? 0} onPick={onPick} onLongPress={onLongPress} />
          ))}
        </div>
        {!products.length && <p className="py-10 text-center text-stone-500">Menu tidak ditemukan.</p>}
      </div>
    </div>
  );
}

function ProductTile({ product, qty, onPick, onLongPress }: { product: Product; qty: number; onPick: (p: Product) => void; onLongPress: (p: Product) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const start = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress(product);
    }, 550);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!longPressed.current && !product.soldOut) onPick(product);
      }}
      className={cx(
        'relative flex h-24 flex-col justify-between rounded-2xl border bg-white p-3 text-left transition-colors active:bg-brand-50',
        qty ? 'border-brand-600 ring-2 ring-brand-200' : 'border-stone-200',
        product.soldOut && 'opacity-50',
      )}
    >
      <span className="line-clamp-2 leading-tight font-semibold">{product.name}</span>
      <span className="flex items-end justify-between">
        <span className="tabular text-sm font-semibold text-brand-700">{formatNumber(product.price)}</span>
        {product.optionGroupIds.length > 0 && <span className="text-xs text-stone-400">opsi</span>}
      </span>
      {qty > 0 && <span className="absolute -top-2 -right-2 grid h-7 min-w-7 place-items-center rounded-full bg-brand-900 px-1.5 text-sm font-bold text-white">{qty}</span>}
      {product.soldOut && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 -rotate-6 text-center text-lg font-black text-red-600">HABIS</span>}
    </button>
  );
}
