// Keranjang belanja + pesanan tersimpan. Disimpan di localStorage agar tidak hilang bila aplikasi ditutup sistem.
import type { Discount, OrderItemOption, OrderType, Product } from '@mourden/shared';
import { uuid } from '../../lib/id';
import type { CartLine } from '../../lib/pos';
import { createStore, useStore } from '../../lib/store';
import { appStore } from '../../lib/state';

export interface CartState {
  lines: CartLine[];
  discount: Discount | null;
  customerName: string;
  orderType: OrderType;
  /** Bila keranjang berasal dari pesanan tersimpan. */
  savedId: string | null;
  tableName: string;
  pax: number;
  checkoutId: string | null;
}

export interface SavedOrder extends CartState {
  id: string;
  label: string;
  savedAt: string;
}

const KEY = 'mourden.cart';
const SAVED_KEY = 'mourden.saved';
const EMPTY: CartState = { lines: [], discount: null, customerName: '', orderType: 'dine_in', savedId: null, tableName: '', pax: 0, checkoutId: null };
const SESSION_KEY = 'mourden.order-session';
interface CartEvent { at: string; action: string; reason: string; actor?: string }
interface OrderSession { cart: CartState; saved: SavedOrder[]; events: CartEvent[] }

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

const initial = load<OrderSession | null>(SESSION_KEY, null);
let sessionRaw = localStorage.getItem(SESSION_KEY);
let events = initial?.events ?? [];
const paidDraftStore = createStore<{ id: string | null }>({ id: null });
export const markPaidDraft = (id: string) => paidDraftStore.set({ id });
export const usePaidDraft = () => useStore(paidDraftStore, (s) => s.id);
export const cartEventsStore = createStore<{ list: CartEvent[] }>({ list: events });
export const useCartEvents = () => useStore(cartEventsStore, (s) => s.list);
export const cartStore = createStore<CartState>({ ...EMPTY, ...(initial?.cart ?? load<Partial<CartState>>(KEY, {})) });
export const useCart = () => useStore(cartStore, (s) => s);

export const savedStore = createStore<{ list: SavedOrder[] }>({ list: (initial?.saved ?? load<SavedOrder[]>(SAVED_KEY, [])).map((s) => ({ ...EMPTY, ...s })) });
export const useSaved = () => useStore(savedStore, (s) => s.list);

/** Satu penulisan utama menyimpan keranjang + pesanan tujuan/sumber bersamaan. Kegagalan storage tidak menghapus data sesi. */
function commit(cart: CartState, saved = savedStore.get().list, event?: { action: string; reason: string }, completedClear = false) {
  if (!completedClear && cartStore.get().checkoutId && paidDraftStore.get().id === cartStore.get().checkoutId) throw new Error('Pesanan ini sudah dibayar. Kosongkan keranjang sebelum membuat pesanan baru.');
  if (cart.lines.length && !cart.checkoutId) cart = { ...cart, checkoutId: uuid() };
  if (cart.savedId) saved = saved.filter((o) => o.id !== cart.savedId || cart.lines.length > 0).map((o) => o.id === cart.savedId ? { ...o, ...cart, savedId: null, label: cart.customerName.trim() || cart.tableName || o.label } : o);
  const current = localStorage.getItem(SESSION_KEY);
  if (current !== sessionRaw) throw new Error('Pesanan berubah di tab lain. Muat ulang halaman sebelum melanjutkan.');
  const nextEvents = event ? [...events, { ...event, actor: appStore.get().user?.name ?? '', at: new Date().toISOString() }].slice(-100) : events;
  const raw = JSON.stringify({ cart, saved, events: nextEvents });
  try { localStorage.setItem(SESSION_KEY, raw); } catch { throw new Error('Penyimpanan tablet penuh/tidak tersedia. Pesanan belum diubah.'); }
  sessionRaw = raw; events = nextEvents;
  cartEventsStore.set({ list: events });
  cartStore.set(cart); savedStore.set({ list: saved });
  // Mirror kunci existing untuk kompatibilitas; salinan utama di atas menjadi sumber pemulihan.
  persist(KEY, cart); persist(SAVED_KEY, saved);
}

window.addEventListener('storage', (e) => {
  if (e.key !== SESSION_KEY || !e.newValue) return;
  try { const next = JSON.parse(e.newValue) as OrderSession; sessionRaw = e.newValue; events = next.events ?? []; cartEventsStore.set({ list: events }); cartStore.set({ ...EMPTY, ...next.cart }); savedStore.set({ list: next.saved }); } catch { /* data sesi invalid tidak menimpa keranjang */ }
});

function setCart(patch: Partial<CartState>) { commit({ ...cartStore.get(), ...patch }); }

const signature = (productId: string, options: OrderItemOption[], note: string) =>
  `${productId}|${options.map((o) => o.optionId).sort().join(',')}|${note.trim().toLowerCase()}`;

export function addToCart(product: Product, options: OrderItemOption[], qty: number, note: string) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new Error('Jumlah item harus 1–999');
  const s = cartStore.get();
    const sig = signature(product.id, options, note);
    const existing = s.lines.find((l) => signature(l.productId, l.options, l.note) === sig);
    if (existing) {
      if (existing.qty + qty > 999) throw new Error('Maksimal 999 item dalam satu baris');
      commit({ ...s, lines: s.lines.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l)) }); return;
    }
    commit({
      ...s,
      lines: [...s.lines, { key: uuid(), productId: product.id, name: product.name, basePrice: product.price, options, qty, note: note.trim() }],
    });
}

export function updateLine(key: string, patch: Partial<CartLine>) {
  if (patch.qty !== undefined && (!Number.isInteger(patch.qty) || patch.qty < 0 || patch.qty > 999)) throw new Error('Jumlah item harus 0–999');
  setCart({ lines: cartStore.get().lines.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.qty > 0) });
}

export function removeLine(key: string) {
  setCart({ lines: cartStore.get().lines.filter((l) => l.key !== key) });
}

export function setDiscount(discount: Discount | null) {
  setCart({ discount });
}

export function setCustomerName(customerName: string) {
  setCart({ customerName });
}

export function setOrderType(orderType: OrderType) {
  setCart({ orderType, ...(orderType === 'take_away' ? { tableName: '' } : {}) });
}

export function setService(tableName: string, pax: number) {
  const cart = cartStore.get();
  const table = tableName.trim().slice(0, 40);
  if (!Number.isInteger(pax) || pax < 0 || pax > 999) throw new Error('Pax harus 0–999');
  if (table && cart.orderType !== 'dine_in') throw new Error('Meja hanya untuk Dine In');
  if (table && savedStore.get().list.some((o) => o.id !== cart.savedId && o.tableName === table)) throw new Error('Meja ini memiliki pesanan tersimpan. Buka pesanan tersebut atau pilih meja kosong.');
  setCart({ tableName: table, pax });
}

/** Mengosongkan keranjang. Pesanan tersimpan yang sedang dibuka ikut dihapus (sudah dibayar/dibatalkan). */
export function clearCart() {
  const { savedId } = cartStore.get();
  commit(EMPTY, savedStore.get().list.filter((o) => o.id !== savedId), undefined, true);
}

/** Simpan keranjang saat ini (pelanggan belum selesai memilih / bayar nanti), lalu kosongkan. */
export function saveCart(): SavedOrder | null {
  const cart = cartStore.get();
  if (!cart.lines.length) return null;
  const list = savedStore.get().list;
  const id = cart.savedId ?? uuid();
  const label = cart.customerName.trim() || cart.tableName || `Pesanan ${list.length + 1}`;
  const saved: SavedOrder = { ...cart, savedId: null, id, label, savedAt: new Date().toISOString() };
  commit(EMPTY, [...list.filter((o) => o.id !== id), saved]);
  return saved;
}

/** Buka pesanan tersimpan. Keranjang yang sedang terisi otomatis disimpan dulu. */
export function openSaved(id: string) {
  if (cartStore.get().savedId === id) return;
  const target = savedStore.get().list.find((o) => o.id === id);
  if (!target) return;
  if (cartStore.get().lines.length && cartStore.get().savedId !== id) saveCart();
  const { id: _id, label: _l, savedAt: _t, ...cart } = target;
  commit({ ...EMPTY, ...cart, savedId: id });
}

export function deleteSaved(id: string, reason = '') {
  const cart = cartStore.get();
  commit({ ...cart, savedId: cart.savedId === id ? null : cart.savedId }, savedStore.get().list.filter((o) => o.id !== id), { action: `Hapus pesanan ${id}`, reason });
}

export function cancelLine(key: string, reason: string) {
  const cart = cartStore.get();
  commit({ ...cart, lines: cart.lines.filter((l) => l.key !== key) }, undefined, { action: `Hapus item ${cart.lines.find((l) => l.key === key)?.name ?? key}`, reason });
}

/** Pemindahan qty dari keranjang ke pesanan tersimpan; tidak mencatat pembayaran atau mengurangi stok. */
export function transferItems(selection: Record<string, number>, targetId: string | null, tableName = '') {
  const cart = cartStore.get();
  const saved = savedStore.get().list;
  const target = targetId ? saved.find((o) => o.id === targetId) : null;
  if (targetId && (!target || targetId === cart.savedId)) throw new Error('Pesanan tujuan tidak valid');
  if (target && target.orderType !== cart.orderType) throw new Error('Tipe pesanan sumber dan tujuan harus sama');
  if (cart.discount || target?.discount) throw new Error('Lepaskan diskon dahulu sebelum memindahkan item agar potongan tidak terhitung ganda.');
  if (tableName && (cart.orderType !== 'dine_in' || saved.some((o) => o.tableName === tableName && o.id !== cart.savedId) || tableName === cart.tableName)) throw new Error('Pilih meja tujuan yang kosong dan berbeda');
  if (Object.keys(selection).some((key) => !cart.lines.some((l) => l.key === key))) throw new Error('Item sumber sudah berubah');
  const moved: CartLine[] = [];
  const remaining: CartLine[] = [];
  for (const line of cart.lines) {
    const qty = selection[line.key] ?? 0;
    if (!Number.isInteger(qty) || qty < 0 || qty > line.qty) throw new Error('Jumlah pindah tidak valid');
    if (qty) moved.push({ ...line, key: uuid(), qty });
    if (qty < line.qty) remaining.push({ ...line, qty: line.qty - qty });
  }
  if (!moved.length) throw new Error('Pilih minimal satu item');
  const destination: SavedOrder = target ? { ...target, lines: [...target.lines, ...moved], savedAt: new Date().toISOString() } : { ...EMPTY, id: uuid(), checkoutId: uuid(), label: tableName || 'Pesanan pindahan', tableName, orderType: cart.orderType, lines: moved, savedAt: new Date().toISOString() };
  if (destination.lines.length > 200) throw new Error('Maksimal 200 baris dalam pesanan tujuan');
  const next = saved.filter((o) => o.id !== destination.id && (o.id !== cart.savedId || remaining.length > 0)).map((o) => o.id === cart.savedId ? { ...o, lines: remaining } : o);
  commit(remaining.length ? { ...cart, lines: remaining } : EMPTY, [...next, destination], { action: `Pindah item ke ${destination.label}`, reason: '' });
  return destination;
}
