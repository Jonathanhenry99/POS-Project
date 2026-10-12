import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Catalog } from '@mourden/shared';
import { makePrintJob, storePrintJobs } from '../printing/queue';
import { previewPrintStore, sendPrintJob } from '../printing/service';
import { DEFAULT_PRINTER_CONFIG } from '../printing/types';
import { authHeaders } from './api';
import { LIVE_TEST_DB, MAIN_DB, PREVIEW_DB, db, deleteDatabase, useDatabase } from './idb';
import { checkout, openShift } from './pos';
import { enterPreview, exitPreview, setPreviewLive } from './preview';
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
const READS = ['/api/settings', '/api/admin/catalog', '/api/ingredients', '/api/users'];
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  const body =
    url === '/api/settings' ? DEFAULT_SETTINGS
    : url === '/api/admin/catalog' ? catalog
    : url === '/api/ingredients' ? []
    : url === '/api/users' ? [owner, { ...owner, id: '99999999-9999-4999-8999-999999999999', name: 'Budi', username: 'budi', role: 'barista' }]
    : url === '/api/devices/test' ? { device: { id: 'dev-uji', name: 'Uji owner', code: 'U' }, token: 'token-uji' }
    : url.startsWith('/api/orders/') || url.startsWith('/api/shifts/') || url.startsWith('/api/business-days/') ? { ok: true }
    : null;
  return new Response(JSON.stringify(body ?? { error: 'tidak boleh dipanggil' }), { status: body ? 200 : 500 });
});

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  appStore.set({ mode: 'online', preview: false, previewLive: false, device: null, data: null, user: owner, token: 'jwt-owner', activeShift: null });
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
  expect(calls.filter((u) => !READS.includes(u))).toEqual([]);
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

it('uji langsung: transaksi dikirim dengan token perangkat uji, admin tetap memakai sesi owner, data tidak dihapus saat keluar', async () => {
  await useDatabase(LIVE_TEST_DB); await useDatabase(MAIN_DB); await deleteDatabase(LIVE_TEST_DB);
  await enterPreview();
  await setPreviewLive(true);
  expect(appStore.get()).toMatchObject({ preview: true, previewLive: true, mode: 'tablet', device: { token: 'token-uji' } });
  // Kode perangkat uji + 2 karakter unik per browser, supaya nomor struk tidak bentrok antar-browser.
  expect(appStore.get().device!.code).toMatch(/^U[A-Z2-9]{2}$/);
  // Karyawan lain ikut dimuat untuk menguji komplimen.
  expect(appStore.get().data!.users.map((u) => u.name)).toEqual(['Owner', 'Budi']);
  expect(authHeaders()).toEqual({ Authorization: 'Bearer jwt-owner' });
  expect(authHeaders(owner.id, true)).toEqual({ Authorization: 'Device token-uji', 'X-Operator': owner.id });

  await openShift(50000);
  const order = await checkout({ lines: [{ key: 'l1', productId: 'p1', name: 'Latte', basePrice: 25000, options: [], qty: 1, note: '' }], discount: null, customerName: '', orderType: 'take_away', method: 'cash', tendered: 50000, reference: '' });
  expect(order.number.startsWith('U')).toBe(true);
  await flushOutbox();
  const sent = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/orders/'));
  expect(sent).toHaveLength(1);
  expect((sent[0][1]!.headers as Record<string, string>).Authorization).toBe('Device token-uji');
  expect(await (await db()).count('outbox')).toBe(0);

  await exitPreview();
  expect(appStore.get()).toMatchObject({ preview: false, previewLive: false, mode: 'online' });
  // Masuk lagi: shift & transaksi uji masih ada.
  await enterPreview({ live: true });
  expect(appStore.get().activeShift).not.toBeNull();
  expect(await (await db()).count('orders')).toBe(1);
  // Kembali ke simulasi: perangkat pratinjau, tanpa pengiriman.
  await setPreviewLive(false);
  expect(appStore.get()).toMatchObject({ previewLive: false, device: { code: 'P' } });
  expect(authHeaders(owner.id, true)).toEqual({ Authorization: 'Bearer jwt-owner' });
});
