import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Product } from '@mourden/shared';
let cart: typeof import('./cart');
let storage: Map<string, string>; let fail = false;
const product: Product = { id: 'kopi', name: 'Kopi', categoryId: 'minum', sku: '', price: 25000, active: true, soldOut: false, sort: 0, optionGroupIds: [] };
beforeEach(async () => {
  vi.resetModules(); storage = new Map(); fail = false;
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { if (fail) throw new Error('quota'); storage.set(k, v); }, removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('window', { addEventListener: () => {} });
  cart = await import('./cart');
});
afterEach(() => vi.unstubAllGlobals());
it('memulihkan kunci existing dan menyimpan qty/varian/catatan pindahan tanpa kehilangan total', () => {
  cart.setService('Meja 1', 3); cart.addToCart(product, [{ optionId: 'ice', groupName: 'Suhu', name: 'Iced', priceDelta: 2000 }], 4, 'Less ice');
  const source = cart.saveCart()!; cart.openSaved(source.id);
  const key = cart.cartStore.get().lines[0].key;
  const destination = cart.transferItems({ [key]: 2 }, null, 'Meja 2');
  expect(cart.cartStore.get().lines[0].qty).toBe(2); expect(destination.lines[0].qty).toBe(2);
  expect(destination.lines[0].options[0].priceDelta).toBe(2000); expect(destination.lines[0].note).toBe('Less ice');
  expect(cart.savedStore.get().list.find((o) => o.id === source.id)!.lines[0].qty).toBe(2);
  const durable = JSON.parse(storage.get('mourden.order-session')!);
  expect(durable.saved.reduce((sum: number, o: { lines: { qty: number }[] }) => sum + o.lines.reduce((n, l) => n + l.qty, 0), 0)).toBe(4);
});
it('pindah seluruh qty mengosongkan sumber saja, tidak memanggil pembayaran', () => {
  cart.addToCart(product, [], 2, ''); const source = cart.saveCart()!; cart.openSaved(source.id);
  const dest = cart.transferItems({ [cart.cartStore.get().lines[0].key]: 2 }, null);
  expect(cart.cartStore.get().lines).toHaveLength(0);
  expect(cart.savedStore.get().list.map((o) => o.id)).toEqual([dest.id]);
});
it('menolak tujuan sama, tipe berbeda, jumlah berlebih, meja terisi dan diskon tanpa mengubah sumber', () => {
  cart.setOrderType('take_away'); cart.addToCart(product, [], 1, ''); const target = cart.saveCart()!;
  cart.setOrderType('dine_in'); cart.addToCart(product, [], 2, ''); const before = JSON.stringify(cart.cartStore.get()); const key = cart.cartStore.get().lines[0].key;
  expect(() => cart.transferItems({ [key]: 1 }, target.id)).toThrow('Tipe');
  expect(() => cart.transferItems({ [key]: 3 }, null)).toThrow('Jumlah');
  expect(JSON.stringify(cart.cartStore.get())).toBe(before);
  cart.setDiscount({ type: 'percent', value: 10, reason: 'Promo' });
  expect(() => cart.transferItems({ [key]: 1 }, null)).toThrow('diskon');
  cart.setDiscount(null); cart.setService('Meja 1', 1); const own = cart.saveCart()!; cart.openSaved(own.id);
  expect(() => cart.transferItems({ [key]: 1 }, own.id)).toThrow('tujuan');
  cart.clearCart(); expect(() => cart.setService('Meja 1', 2)).not.toThrow();
});
it('storage gagal mempertahankan sumber dan tujuan tanpa setengah pemindahan', () => {
  cart.addToCart(product, [], 3, ''); const key = cart.cartStore.get().lines[0].key; const before = storage.get('mourden.order-session');
  fail = true; expect(() => cart.transferItems({ [key]: 1 }, null)).toThrow('Penyimpanan');
  expect(cart.cartStore.get().lines[0].qty).toBe(3); expect(cart.savedStore.get().list).toHaveLength(0); expect(storage.get('mourden.order-session')).toBe(before);
});
it('keranjang selesai terkunci bila pengosongan gagal; tidak bisa ditransfer menjadi pesanan baru', () => {
  cart.addToCart(product, [], 2, ''); const key = cart.cartStore.get().lines[0].key;
  cart.markPaidDraft(cart.cartStore.get().checkoutId!); fail = true;
  expect(() => cart.clearCart()).toThrow('Penyimpanan');
  expect(() => cart.transferItems({ [key]: 2 }, null)).toThrow('sudah dibayar');
  expect(() => cart.addToCart(product, [], 1, '')).toThrow('sudah dibayar');
  fail = false; cart.clearCart(); cart.addToCart(product, [], 1, ''); expect(cart.cartStore.get().lines[0].qty).toBe(1);
});
it('meja/pax pada saved order aktif mengikuti perubahan dan legacy cart tetap pulih', async () => {
  cart.addToCart(product, [], 1, ''); cart.setService('Meja 1', 1); const saved = cart.saveCart()!; cart.openSaved(saved.id); cart.setService('Meja 2', 4);
  expect(cart.savedStore.get().list[0].tableName).toBe('Meja 2'); expect(cart.savedStore.get().list[0].pax).toBe(4);
  storage.delete('mourden.order-session'); storage.set('mourden.cart', JSON.stringify({ lines: [{ key: 'legacy', productId: 'kopi', name: 'Kopi', basePrice: 25000, qty: 1, options: [], note: '' }], discount: null, customerName: 'Lama', orderType: 'dine_in', savedId: null }));
  vi.resetModules(); const legacy = await import('./cart'); expect(legacy.cartStore.get().customerName).toBe('Lama'); expect(legacy.cartStore.get().tableName).toBe(''); expect(legacy.cartStore.get().lines).toHaveLength(1);
});
