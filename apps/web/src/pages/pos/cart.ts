// Keranjang belanja + pesanan tersimpan. Disimpan di localStorage agar tidak hilang bila aplikasi ditutup sistem.
import type { Discount, OrderItemOption, OrderType, Product } from '@mourden/shared';
import { uuid } from '../../lib/id';
import type { CartLine } from '../../lib/pos';
import { createStore, useStore } from '../../lib/store';

interface CartState {
  lines: CartLine[];
  discount: Discount | null;
  customerName: string;
  orderType: OrderType;
  /** Bila keranjang berasal dari pesanan tersimpan. */
  savedId: string | null;
}

export interface SavedOrder extends CartState {
  id: string;
  label: string;
  savedAt: string;
}

const KEY = 'mourden.cart';
const SAVED_KEY = 'mourden.saved';
const EMPTY: CartState = { lines: [], discount: null, customerName: '', orderType: 'dine_in', savedId: null };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* abaikan */
  }
}

export const cartStore = createStore<CartState>({ ...EMPTY, ...load<Partial<CartState>>(KEY, {}) });
cartStore.subscribe(() => persist(KEY, cartStore.get()));
export const useCart = () => useStore(cartStore, (s) => s);

export const savedStore = createStore<{ list: SavedOrder[] }>({ list: load<SavedOrder[]>(SAVED_KEY, []) });
savedStore.subscribe(() => persist(SAVED_KEY, savedStore.get().list));
export const useSaved = () => useStore(savedStore, (s) => s.list);

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

export function setOrderType(orderType: OrderType) {
  cartStore.set({ orderType });
}

/** Mengosongkan keranjang. Pesanan tersimpan yang sedang dibuka ikut dihapus (sudah dibayar/dibatalkan). */
export function clearCart() {
  const { savedId } = cartStore.get();
  if (savedId) savedStore.set((s) => ({ list: s.list.filter((o) => o.id !== savedId) }));
  cartStore.set(EMPTY);
}

/** Simpan keranjang saat ini (pelanggan belum selesai memilih / bayar nanti), lalu kosongkan. */
export function saveCart(): SavedOrder | null {
  const cart = cartStore.get();
  if (!cart.lines.length) return null;
  const list = savedStore.get().list;
  const id = cart.savedId ?? uuid();
  const label = cart.customerName.trim() || `Pesanan ${list.length + 1}`;
  const saved: SavedOrder = { ...cart, savedId: null, id, label, savedAt: new Date().toISOString() };
  savedStore.set({ list: [...list.filter((o) => o.id !== id), saved] });
  cartStore.set(EMPTY);
  return saved;
}

/** Buka pesanan tersimpan. Keranjang yang sedang terisi otomatis disimpan dulu. */
export function openSaved(id: string) {
  const target = savedStore.get().list.find((o) => o.id === id);
  if (!target) return;
  if (cartStore.get().lines.length && cartStore.get().savedId !== id) saveCart();
  const { id: _id, label: _l, savedAt: _t, ...cart } = target;
  cartStore.set({ ...cart, savedId: id });
}

export function deleteSaved(id: string) {
  savedStore.set((s) => ({ list: s.list.filter((o) => o.id !== id) }));
  if (cartStore.get().savedId === id) cartStore.set({ savedId: null });
}
