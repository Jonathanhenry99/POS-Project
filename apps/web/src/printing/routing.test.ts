import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@mourden/shared';
let routing: typeof import('./routing'); let database: typeof import('../lib/idb'); let cart: typeof import('../pages/pos/cart');
beforeEach(async () => {
  if (database) await database.resetDbForTests(); vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  vi.stubGlobal('window', { addEventListener: () => {} });
  database = await import('../lib/idb'); routing = await import('./routing'); cart = await import('../pages/pos/cart');
  const { appStore } = await import('../lib/state');
  appStore.set({ data: { settings: { ...DEFAULT_SETTINGS, pos: { tables: [], notes: [], cancellationReasons: [], productStations: { kopi: 'bar', roti: 'kitchen' } } }, catalog: { products: [], categories: [], optionGroups: [] }, ingredients: [], users: [], fetchedAt: '' } });
  cart.cartStore.set({ lines: [{ key: 'kopi', productId: 'kopi', name: 'Kopi', basePrice: 25000, options: [], qty: 2, note: 'Less ice' }, { key: 'roti', productId: 'roti', name: 'Roti', basePrice: 20000, options: [], qty: 1, note: '' }], tableName: 'Meja 1', pax: 2 });
});
afterEach(() => vi.unstubAllGlobals());
it('routing memisahkan item station dan tidak mengurangi item/qty atau mencatat penjualan', async () => {
  await routing.saveStationRoutes({ bar: { profileId: 'existing', mode: 'order' }, kitchen: { profileId: 'existing', mode: 'item' } });
  const jobs = await routing.queueChecker(); expect(jobs).toHaveLength(2);
  const text = (job: typeof jobs[number]) => job.ops.filter((o) => o.kind === 'text').map((o) => o.text).join('\n');
  expect(text(jobs[0])).toContain('2x Kopi'); expect(text(jobs[0])).not.toContain('Roti'); expect(text(jobs[1])).toContain('1x Roti');
  expect(cart.cartStore.get().lines[0].qty).toBe(2); expect(await (await database.db()).count('orders')).toBe(0);
});
it('station belum dipetakan menolak seluruh batch, tanpa sebagian tiket masuk antrean', async () => {
  await routing.saveStationRoutes({ bar: { profileId: 'existing', mode: 'order' } });
  await expect(routing.queueChecker()).rejects.toThrow('Dapur');
  expect(await (await database.db()).count('printJobs')).toBe(0);
});
it('mode per jumlah membuat satu tiket per unit dan membatasi batch besar sebelum disimpan', async () => {
  await routing.saveStationRoutes({ bar: { profileId: 'existing', mode: 'quantity' }, kitchen: { profileId: 'existing', mode: 'quantity' } });
  expect(await routing.queueChecker()).toHaveLength(3);
  cart.cartStore.set({ lines: [{ ...cart.cartStore.get().lines[0], qty: 999 }] });
  await expect(routing.queueChecker()).rejects.toThrow('200 tiket');
  expect(await (await database.db()).count('printJobs')).toBe(3);
});
