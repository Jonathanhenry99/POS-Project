import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { businessDate, DEFAULT_SETTINGS, toEscPos, testReceipt, DEFAULT_LAYOUT, type Catalog } from '@mourden/shared';
import { rawbtIntentUrl, RawBTPrinter } from '../printing/rawbt';
import { db, resetDbForTests, type BootstrapData } from './idb';
import { checkout, closeShift, listOrders, openShift, voidOrder, type CartLine } from './pos';
import { appStore } from './state';
import { flushOutbox, listOutbox } from './sync';

const catalog: Catalog = { categories: [], products: [], optionGroups: [] };
const data: BootstrapData = { settings: DEFAULT_SETTINGS, catalog, ingredients: [], users: [], fetchedAt: '' };
const user = { id: '11111111-1111-4111-8111-111111111111', name: 'Rina', username: 'rina', role: 'kasir' as const, active: true };

const line = (price: number, qty = 1): CartLine => ({
  key: crypto.randomUUID(),
  productId: '22222222-2222-4222-8222-222222222222',
  name: 'Americano',
  basePrice: price,
  options: [],
  qty,
  note: '',
});

function mockFetch(responses: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return next();
    }),
  );
  return calls;
}

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 201 });
const rejected = () => new Response(JSON.stringify({ error: 'Perhitungan transaksi tidak valid' }), { status: 400 });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(async () => {
  await resetDbForTests();
  appStore.set({
    mode: 'tablet',
    device: { id: 'dev-1', name: 'Tablet', code: 'A', token: 'tok' },
    data,
    user,
    activeShift: null,
    online: true,
  });
  mockFetch([]);
  await openShift(200000);
  await flushOutbox();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RawBT', () => {
  it('membentuk URL intent sesuai konektor resmi RawBT', () => {
    const bytes = new Uint8Array([0x1b, 0x40, 0x48, 0x69, 0x0a]);
    expect(rawbtIntentUrl(bytes)).toBe('intent:base64,G0BIaQo=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;');
  });

  it('mengirim struk lewat navigasi intent tanpa dialog', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Redmi Pad 2)' });
    const opened: string[] = [];
    const bytes = toEscPos(testReceipt(DEFAULT_SETTINGS.store, DEFAULT_LAYOUT, 'RawBT', new Date().toISOString()));
    const res = await new RawBTPrinter((u) => opened.push(u)).print(bytes);
    expect(res.kind).toBe('handed-off');
    expect(opened).toHaveLength(1);
    const b64 = opened[0].slice('intent:base64,'.length, opened[0].indexOf('#Intent'));
    expect(Array.from(atob(b64), (c) => c.charCodeAt(0))).toEqual([...bytes]);
  });

  it('menolak di perangkat non-Android dengan pesan jelas', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' });
    await expect(new RawBTPrinter(() => {}).print(new Uint8Array([1]))).rejects.toThrow('Android');
  });
});

describe('transaksi offline-first', () => {
  it('nomor struk berurutan per hari dengan kode perangkat', async () => {
    mockFetch([offline, offline, offline]);
    const a = await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 30000, reference: '' });
    const b = await checkout({ lines: [line(30000, 2)], discount: null, customerName: 'Budi', orderType: 'take_away', method: 'qris', tendered: 0, reference: '' });
    const date = businessDate(new Date().toISOString(), 'Asia/Jakarta').slice(2).replace(/-/g, '');
    expect(a.number).toBe(`A${date}-001`);
    expect(b.number).toBe(`A${date}-002`);
    // service 5% aktif secara default
    expect(a.total).toBe(26250);
    expect(a.payment.change).toBe(3750);
    expect(b.payment.tendered).toBe(b.total);
  });

  it('menolak uang tunai kurang dari total', async () => {
    await expect(checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 10000, reference: '' })).rejects.toThrow('kurang');
  });

  it('saat offline transaksi tetap tersimpan dan menunggu di antrean', async () => {
    mockFetch([offline, offline]);
    const order = await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await flushOutbox();
    const [saved] = await listOrders();
    expect(saved.id).toBe(order.id);
    expect(saved.sync).toBe('pending');
    const queue = await listOutbox();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBeGreaterThan(0);
    expect(appStore.get().online).toBe(false);
  });

  it('saat online kembali, antrean terkirim berurutan dan transaksi ditandai tersinkron', async () => {
    mockFetch([offline, offline]);
    const order = await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await flushOutbox();
    const calls = mockFetch([ok]);
    await flushOutbox();
    expect(calls[0].url).toBe(`/api/orders/${order.id}`);
    expect(calls[0].init.method).toBe('PUT');
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe('Device tok');
    expect((calls[0].init.headers as Record<string, string>)['X-Operator']).toBe(user.id);
    expect(await listOutbox()).toHaveLength(0);
    expect((await listOrders())[0].sync).toBe('synced');
  });

  it('data yang ditolak server ditandai gagal tanpa menahan antrean lain', async () => {
    mockFetch([offline, offline, offline]);
    await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await checkout({ lines: [line(15000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await flushOutbox();
    mockFetch([rejected, ok]);
    await flushOutbox();
    const queue = await listOutbox();
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('failed');
    const orders = await listOrders();
    expect(orders.filter((o) => o.sync === 'failed')).toHaveLength(1);
    expect(orders.filter((o) => o.sync === 'synced')).toHaveLength(1);
    expect(appStore.get().sync.failed).toBe(1);
  });

  it('void offline diantrekan setelah transaksinya', async () => {
    mockFetch([offline, offline]);
    const order = await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    const voided = await voidOrder(order, 'Salah input', null);
    expect(voided.status).toBe('void');
    const queue = await listOutbox();
    expect(queue.map((q) => `${q.method} ${q.path}`)).toEqual([`PUT /orders/${order.id}`, `POST /orders/${order.id}/void`]);
    expect((queue[1].body as { reason: string }).reason).toBe('Salah input');
  });

  it('tutup kasir menghitung kas seharusnya dan menutup shift', async () => {
    mockFetch([offline, offline, offline, offline]);
    const a = await checkout({ lines: [line(20000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await checkout({ lines: [line(40000)], discount: null, customerName: '', orderType: 'dine_in', method: 'card', tendered: 0, reference: '' });
    const c = await checkout({ lines: [line(10000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 10500, reference: '' });
    await voidOrder(c, 'Batal', null);
    const shift = await closeShift(221000, '');
    expect(shift.summary!.orderCount).toBe(2);
    expect(shift.summary!.voidCount).toBe(1);
    expect(shift.summary!.byMethod.cash).toBe(a.total);
    expect(shift.summary!.expectedCash).toBe(200000 + a.total);
    expect(appStore.get().activeShift).toBeNull();
    const stored = await (await db()).get('shifts', shift.id);
    expect(stored?.closedAt).toBeTruthy();
  });

  it('tidak bisa berjualan tanpa shift aktif', async () => {
    await closeShift(200000, '');
    await expect(checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 30000, reference: '' })).rejects.toThrow('shift');
  });
});
