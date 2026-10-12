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

it('cetak tagihan dihitung per pesanan; pengurangan item & pengosongan sesudahnya dilaporkan', () => {
  const sent: { type: string; billPrints: number; detail: string; amount: number; orderRef: string; reason: string }[] = [];
  cart.setCartReporter((e) => sent.push(e));
  cart.addToCart(product, [], 2, '');
  cart.noteBillPrinted(); cart.noteBillPrinted();
  expect(sent.map((e) => [e.type, e.billPrints])).toEqual([['bill_printed', 1], ['bill_printed', 2]]);
  expect(sent[0].orderRef).toBe(sent[1].orderRef); expect(sent[0].amount).toBe(50000);
  cart.updateLine(cart.cartStore.get().lines[0].key, { qty: 1 });
  expect(sent[2]).toMatchObject({ type: 'item_removed', detail: 'Kopi: 2 → 1', amount: 25000, billPrints: 2 });
  cart.updateLine(cart.cartStore.get().lines[0].key, { qty: 3 });
  expect(sent).toHaveLength(3);
  cart.discardCart();
  expect(sent[3]).toMatchObject({ type: 'order_deleted', billPrints: 2, amount: 75000 });
  expect(cart.cartStore.get().lines).toHaveLength(0); expect(cart.cartStore.get().billPrints).toBe(0);
});
it('tanpa tagihan: edit biasa tidak dilaporkan; pesanan tersimpan yang dibatalkan dilaporkan beserta alasannya', () => {
  const sent: { type: string; reason: string; label: string; billPrints: number }[] = [];
  cart.setCartReporter((e) => sent.push(e));
  cart.addToCart(product, [], 2, ''); cart.updateLine(cart.cartStore.get().lines[0].key, { qty: 1 }); cart.discardCart();
  expect(sent).toHaveLength(0);
  cart.setService('Meja 4', 2); cart.addToCart(product, [], 1, ''); cart.noteBillPrinted();
  const saved = cart.saveCart()!;
  expect(saved.billPrints).toBe(1);
  cart.deleteSaved(saved.id, 'pelanggan pergi');
  expect(sent[sent.length - 1]).toMatchObject({ type: 'order_deleted', reason: 'pelanggan pergi', label: 'Meja 4', billPrints: 1 });
  // Pesanan tersimpan yang dibuka lalu dikosongkan juga dilaporkan walau tagihan belum dicetak.
  cart.addToCart(product, [], 1, ''); const held = cart.saveCart()!; cart.openSaved(held.id); const n = sent.length; cart.discardCart();
  expect(sent).toHaveLength(n + 1); expect(sent[n].type).toBe('order_deleted');
});
