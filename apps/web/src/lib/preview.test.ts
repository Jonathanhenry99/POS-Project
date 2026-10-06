import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Catalog } from '@mourden/shared';
import { makePrintJob, storePrintJobs } from '../printing/queue';
import { previewPrintStore, sendPrintJob } from '../printing/service';
import { DEFAULT_PRINTER_CONFIG } from '../printing/types';
import { authHeaders } from './api';
import { MAIN_DB, PREVIEW_DB, db, useDatabase } from './idb';
import { checkout, openShift } from './pos';
import { enterPreview, exitPreview } from './preview';
import { appStore } from './state';
import { flushOutbox } from './sync';

const owner = { id: '11111111-1111-4111-8111-111111111111', name: 'Owner', username: 'owner', role: 'owner' as const, active: true };
const catalog: Catalog = {
  categories: [
    { id: 'c1', name: 'Kopi', sort: 0, active: true },
    { id: 'c2', name: 'Lama', sort: 1, active: false },
  ],
  products: [
    { id: 'p1', categoryId: 'c1', name: 'Latte', sku: 'LAT', price: 25000, active: true, soldOut: false, sort: 0, optionGroupIds: [] },
    { id: 'p2', categoryId: 'c1', name: 'Hazelnut', sku: 'HAL', price: 0, active: false, soldOut: false, sort: 0, optionGroupIds: [] },
    { id: 'p3', categoryId: 'c2', name: 'Menu Lama', sku: '', price: 1000, active: true, soldOut: false, sort: 0, optionGroupIds: [] },
  ],
  optionGroups: [],
};
const fetchMock = vi.fn(async (url: string) => {
  const body = url === '/api/settings' ? DEFAULT_SETTINGS : url === '/api/admin/catalog' ? catalog : url === '/api/ingredients' ? [] : null;
  return new Response(JSON.stringify(body ?? { error: 'tidak boleh dipanggil' }), { status: body ? 200 : 500 });
});

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  appStore.set({ mode: 'online', preview: false, device: null, data: null, user: owner, token: 'jwt-owner', activeShift: null });
});
afterEach(async () => {
  await exitPreview();
  vi.unstubAllGlobals();
});

it('pratinjau: menu aktif dari server, transaksi lokal tidak pernah dikirim, data tablet asli tidak tersentuh', async () => {
  await enterPreview();
  const s = appStore.get();
  expect(s.preview && s.mode === 'tablet' && s.device?.code === 'P').toBe(true);
  expect(s.data!.catalog.products.map((p) => p.name)).toEqual(['Latte']);
  expect(authHeaders()).toEqual({ Authorization: 'Bearer jwt-owner' });

  await openShift(100000);
  const order = await checkout({ lines: [{ key: 'l1', productId: 'p1', name: 'Latte', basePrice: 25000, options: [], qty: 2, note: '' }], discount: null, customerName: '', orderType: 'take_away', method: 'cash', tendered: 100000, reference: '' });
  expect(order.number.startsWith('P')).toBe(true);
  await flushOutbox();
  const calls = fetchMock.mock.calls.map(([url]) => url);
  expect(calls.filter((u) => !['/api/settings', '/api/admin/catalog', '/api/ingredients'].includes(u))).toEqual([]);
  expect(await (await db()).count('outbox')).toBeGreaterThan(0);

  await exitPreview();
  expect(appStore.get()).toMatchObject({ preview: false, mode: 'online', device: null, token: 'jwt-owner' });
  expect(await (await db()).count('orders')).toBe(0);
  // Data simulasi dihapus saat keluar.
  await useDatabase(PREVIEW_DB);
  expect(await (await db()).count('orders')).toBe(0);
  await useDatabase(MAIN_DB);
});

it('pratinjau: dokumen cetak ditampilkan di layar, tidak dikirim ke printer', async () => {
  await enterPreview();
  const job = makePrintJob('Struk P1', [{ kind: 'text', text: 'HALO' }], { id: 'kasir', name: 'Kasir', config: DEFAULT_PRINTER_CONFIG });
  await storePrintJobs([job]);
  expect(await sendPrintJob(job.id)).toBe(true);
  expect(previewPrintStore.get().doc?.label).toBe('Struk P1');
  expect((await (await db()).get('printJobs', job.id))?.state).toBe('handed-off');
  previewPrintStore.set({ doc: null });
});

it('pratinjau hanya untuk owner yang login online', async () => {
  appStore.set({ user: { ...owner, role: 'kasir' } });
  await expect(enterPreview()).rejects.toThrow('owner');
  expect(appStore.get().preview).toBe(false);
});
