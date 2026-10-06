import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { businessDate, DEFAULT_SETTINGS, toEscPos, testReceipt, DEFAULT_LAYOUT, type Catalog } from '@mourden/shared';
import { rawbtIntentUrl, RawBTPrinter } from '../printing/rawbt';
import { db, resetDbForTests, type BootstrapData } from './idb';
import { checkout, closeShift, listOrders, openShift, voidOrder, closeBusinessDay, ensureBusinessDay, businessDayDetails, listBusinessDays, addCashMovement, type CartLine } from './pos';
import { appStore } from './state';
import { flushOutbox, listOutbox, retryFailed } from './sync';
import { fetchOrderArchive } from './order-archive';

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

afterEach(async () => {
  await flushOutbox();
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
  it('retry pembayaran keranjang yang sama tidak membuat nomor/transaksi/outbox kedua; meja/pax ikut snapshot', async () => {
    mockFetch(Array.from({ length: 10 }, () => offline));
    const input = { lines: [line(25000)], discount: null, customerName: 'Budi', orderType: 'dine_in' as const, method: 'cash' as const, tendered: 50000, reference: '', tableName: 'Meja 2', pax: 3, checkoutId: crypto.randomUUID() };
    const first = await checkout(input); const again = await checkout(input);
    expect(again.id).toBe(first.id); expect(again.number).toBe(first.number); expect(await listOrders()).toHaveLength(1);
    expect(first.tableName).toBe('Meja 2'); expect(first.pax).toBe(3);
    await flushOutbox(); expect((await listOutbox()).filter((j) => j.path.startsWith('/orders/'))).toHaveLength(1);
    await (await db()).delete('orders', first.id);
    await expect(checkout(input)).rejects.toThrow('sudah dibayar');
  });
  it('arsip server tidak menimpa void lokal yang masih menunggu sinkron', async () => {
    mockFetch(Array.from({ length: 10 }, () => offline));
    const paid = await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 30000, reference: '' });
    const voided = await voidOrder(paid, 'Salah input', null); await flushOutbox();
    mockFetch([() => new Response(JSON.stringify({ orders: [paid], next: null }), { status: 200 })]);
    const archive = await fetchOrderArchive({ from: '2026-01-01', to: '2026-12-31', q: '', payment: 'all', status: 'all' });
    expect(archive.orders[0].status).toBe('void'); expect((await (await db()).get('orders', paid.id))!.voidReason).toBe(voided.voidReason);
  });
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

describe('hari usaha tambahan', () => {
  it('akhiri shift mempertahankan hari, tutup hari memulai hari baru pada shift berikut', async () => {
    const first = appStore.get().activeShift!;
    const day = (await ensureBusinessDay())!;
    await closeShift(200000, 'Ganti petugas');
    const second = await openShift(200000);
    expect(second.businessDayId).toBe(day.id);
    await closeShift(200000, 'Shift terakhir', 'day');
    const closed = await closeBusinessDay('Selesai');
    expect(closed.shiftIds).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(closed.summary!.openingCash).toBe(200000);
    expect(closed.summary!.netSales).toBe(0);
    const next = await openShift(100000);
    expect(next.businessDayId).not.toBe(day.id);
  });

  it('tutup hari menolak shift aktif dan tidak menghapus antrean', async () => {
    vi.stubGlobal('fetch', vi.fn(offline));
    await checkout({ lines: [line(25000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await flushOutbox();
    const queue = await listOutbox();
    await expect(closeBusinessDay('')).rejects.toThrow('shift terakhir');
    expect(await listOutbox()).toHaveLength(queue.length);
  });

  it('penutupan offline dipersist atomik, retry dan klik kedua tidak menggandakan penutupan', async () => {
    vi.stubGlobal('fetch', vi.fn(offline));
    const o = await checkout({ lines: [line(20000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await addCashMovement('out', 10000, 'Es');
    await closeShift(200000 + o.total - 10000, 'Tutup', 'day');
    const day = await closeBusinessDay('');
    await flushOutbox();
    const before = await listOutbox();
    expect(before.at(-1)?.path).toBe(`/business-days/${day.id}`);
    expect((await listBusinessDays())[0].sync).toBe('pending');
    await expect(closeBusinessDay('')).rejects.toThrow('Tidak ada');
    expect(await listOutbox()).toHaveLength(before.length);
    mockFetch([]);
    await flushOutbox();
    expect(await listOutbox()).toHaveLength(0);
    expect((await listBusinessDays())[0].sync).toBe('synced');
    expect(day.summary).toMatchObject({ cashOut: 10000, lastCountedCash: 200000 + o.total - 10000 });
  });

  it('hari gagal finalisasi terlihat gagal dan dapat retry tanpa membuka kembali shift', async () => {
    await closeShift(200000, '');
    await flushOutbox();
    mockFetch([rejected]);
    await closeBusinessDay('');
    await flushOutbox();
    expect((await listBusinessDays())[0].sync).toBe('failed');
    expect(appStore.get().activeShift).toBeNull();
    mockFetch([]);
    await retryFailed();
    expect((await listBusinessDays())[0].sync).toBe('synced');
    expect((await listBusinessDays())[0].summary?.shiftCount).toBe(1);
  });

  it('hari usaha melewati tengah malam tidak mengganti tanggal kalender nomor struk', async () => {
    const day = (await ensureBusinessDay())!;
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${day.businessDate}T18:10:00.000Z`));
      const o = await checkout({ lines: [line(20000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
      const date = businessDate(o.createdAt, data.settings.store.timezone);
      expect(date).not.toBe(day.businessDate);
      expect(o.number).toContain(date.slice(2).replaceAll('-', ''));
      expect((await ensureBusinessDay())!.id).toBe(day.id);
    } finally { vi.useRealTimers(); }
  });

  it('snapshot hari tertutup tetap tersedia walaupun order lama kemudian menjadi void', async () => {
    const o = await checkout({ lines: [line(20000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' });
    await closeShift(200000 + o.total, '');
    const day = await closeBusinessDay('');
    await voidOrder(o, 'Koreksi owner', null);
    expect((await businessDayDetails(day)).summary.netSales).toBe(o.total);
    expect((await listOrders())[0].status).toBe('void');
  });

  it('tab dengan shift lama tidak bisa menjual setelah shift ditutup', async () => {
    const old = appStore.get().activeShift;
    await closeShift(200000, '');
    appStore.set({ activeShift: old });
    await expect(checkout({ lines: [line(20000)], discount: null, customerName: '', orderType: 'dine_in', method: 'cash', tendered: 50000, reference: '' })).rejects.toThrow('ditutup');
    expect(await listOrders()).toHaveLength(0);
  });
});
