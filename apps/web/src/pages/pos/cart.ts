// Keranjang belanja. Disimpan di localStorage agar tidak hilang bila aplikasi ditutup sistem.
import type { Discount, OrderItemOption, Product } from '@mourden/shared';
import { uuid } from '../../lib/id';
import type { CartLine } from '../../lib/pos';
import { createStore, useStore } from '../../lib/store';

interface CartState {
  lines: CartLine[];
  discount: Discount | null;
  customerName: string;
}

const KEY = 'mourden.cart';
const EMPTY: CartState = { lines: [], discount: null, customerName: '' };

function load(): CartState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export const cartStore = createStore<CartState>(load());
cartStore.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(cartStore.get()));
  } catch {
    /* abaikan */
  }
});

export const useCart = () => useStore(cartStore, (s) => s);

const signature = (productId: string, options: OrderItemOption[], note: string) =>
  `${productId}|${options.map((o) => o.optionId).sort().join(',')}|${note.trim().toLowerCase()}`;

export function addToCart(product: Product, options: OrderItemOption[], qty: number, note: string) {
  cartStore.set((s) => {
    const sig = signature(product.id, options, note);
    const existing = s.lines.find((l) => signature(l.productId, l.options, l.note) === sig);
    if (existing) {
      return { ...s, lines: s.lines.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l)) };
    }
    return {
      ...s,
      lines: [...s.lines, { key: uuid(), productId: product.id, name: product.name, basePrice: product.price, options, qty, note: note.trim() }],
    };
  });
}

export function updateLine(key: string, patch: Partial<CartLine>) {
  cartStore.set((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.qty > 0) }));
}

export function removeLine(key: string) {
  cartStore.set((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== key) }));
}

export function setDiscount(discount: Discount | null) {
  cartStore.set({ discount });
}

export function setCustomerName(customerName: string) {
  cartStore.set({ customerName });
}

export function clearCart() {
  cartStore.set(EMPTY);
}
