import { ChevronRight, Plus, Star } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatNumber, type Catalog, type Product } from '@mourden/shared';
import { cx } from '../../components/ui';
import type { CartLine } from '../../lib/pos';

/** Warna identitas kategori (urutan tetap; bukan peringkat). */
const HUES = ['#2f5bea', '#ff7a1a', '#0e9f8f', '#8b5cf6', '#e5487a', '#0ea5e9', '#65a30d', '#d97706'];

export function categoryHue(catalog: Catalog, categoryId: string) {
  const i = catalog.categories.findIndex((c) => c.id === categoryId);
  return HUES[(i < 0 ? 0 : i) % HUES.length];
}

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase();
}

export function ProductGrid({
  catalog,
  lines,
  favorites,
  query,
  onPick,
  onLongPress,
}: {
  catalog: Catalog;
  lines: CartLine[];
  favorites: string[];
  query: string;
  onPick: (p: Product) => void;
  onLongPress: (p: Product) => void;
}) {
  const [category, setCategory] = useState<string>(() => (favorites.length ? 'fav' : 'all'));

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return catalog.products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase() === q);
    if (category === 'fav') return favorites.map((id) => catalog.products.find((p) => p.id === id)).filter((p): p is Product => !!p);
    return catalog.products.filter((p) => category === 'all' || p.categoryId === category);
  }, [catalog.products, category, query, favorites]);

  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    return m;
  }, [lines]);

  const chip = (active: boolean) =>
    cx(
      'press flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold whitespace-nowrap',
      active ? 'bg-grad-accent border-transparent text-white shadow-[0_8px_20px_-10px_var(--accent)]' : 'border-line-strong bg-surface text-fg-muted hover:border-primary/50 hover:text-fg',
    );

  const crumb = query ? `Hasil pencarian “${query}”` : category === 'fav' ? 'Favorit' : category === 'all' ? 'Semua menu' : catalog.categories.find((c) => c.id === category)?.name;

  return (
    <div className="flex h-full flex-col">
      {!query && (
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pt-4 pb-1">
          {favorites.length > 0 && (
            <button className={chip(category === 'fav')} onClick={() => setCategory('fav')}>
              <Star className={cx('size-4', category === 'fav' ? 'fill-white' : 'fill-accent text-accent')} /> Favorit
            </button>
          )}
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
      <p className="flex shrink-0 items-center gap-1 px-4 pt-3 pb-2 text-sm text-fg-subtle">
        Pilih Kategori <ChevronRight className="size-4" /> <span className="font-semibold text-primary">{crumb}</span>
        <span className="ml-auto text-xs">{products.length} menu</span>
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div key={category + query} className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
          {products.map((p, i) => (
            <ProductTile
              key={p.id}
              index={i}
              product={p}
              hue={categoryHue(catalog, p.categoryId)}
              qty={qtyInCart.get(p.id) ?? 0}
              onPick={onPick}
              onLongPress={onLongPress}
            />
          ))}
        </div>
        {!products.length && <p className="py-10 text-center text-fg-muted">Menu tidak ditemukan.</p>}
      </div>
    </div>
  );
}

function ProductTile({
  product,
  hue,
  qty,
  index,
  onPick,
  onLongPress,
}: {
  product: Product;
  hue: string;
  qty: number;
  index: number;
  onPick: (p: Product) => void;
  onLongPress: (p: Product) => void;
}) {
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
  const style = {
    '--hue': hue,
    animationDelay: `${Math.min(index, 16) * 18}ms`,
    background: `linear-gradient(160deg, color-mix(in oklab, ${hue} 11%, white) 0%, color-mix(in oklab, ${hue} 4%, white) 100%)`,
    borderColor: qty ? hue : `color-mix(in oklab, ${hue} 18%, white)`,
  } as CSSProperties;
  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!longPressed.current && !product.soldOut) onPick(product);
      }}
      style={style}
      className={cx(
        'press animate-rise group relative flex h-[118px] flex-col justify-between overflow-hidden rounded-2xl border-2 p-3 text-left hover:shadow-card',
        qty > 0 && 'shadow-[0_10px_24px_-14px_var(--hue)]',
        product.soldOut && 'opacity-55 grayscale',
      )}
    >
      <span className="flex items-start gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-white" style={{ background: hue }}>
          {initials(product.name)}
        </span>
        <span className={cx('line-clamp-2 leading-tight font-semibold text-fg', qty > 0 && 'pr-6')}>{product.name}</span>
      </span>
      <span className="flex items-end justify-between">
        <span>
          <span className="block text-[15px] font-extrabold text-fg tabular">{formatNumber(product.price)}</span>
          {product.optionGroupIds.length > 0 && <span className="text-[11px] font-medium text-fg-subtle">+ varian</span>}
        </span>
        <span className="grid size-8 place-items-center rounded-full bg-white text-[var(--hue)] shadow-sm transition-transform group-active:scale-90">
          <Plus className="size-4" strokeWidth={3} />
        </span>
      </span>
      {qty > 0 && (
        <span key={qty} className="animate-pop absolute top-2 right-2 grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-sm font-bold text-white shadow" style={{ background: hue }}>
          {qty}
        </span>
      )}
      {product.soldOut && (
        <span className="absolute inset-0 grid place-items-center bg-white/40">
          <span className="-rotate-6 rounded-lg bg-danger px-3 py-1 text-sm font-black tracking-widest text-white">HABIS</span>
        </span>
      )}
    </button>
  );
}
