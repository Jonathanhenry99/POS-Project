import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { computeTotals, computeShiftSummary, computeBusinessDaySummary, mergeSettings, priceLine, type BusinessDay, type Catalog, type Order, type OrderItemOption, type Shift } from '@mourden/shared';
import { createApp } from '../src/app';
import { pool, setPool } from '../src/db';
import { migrate } from '../src/migrate';
import { seed } from '../src/seed';

const app = createApp();
let ownerToken = '';
let deviceToken = '';
let users: { id: string; username: string; role: string }[] = [];
let catalog: Catalog;
const shiftId = randomUUID();

const userId = (username: string) => users.find((u) => u.username === username)!.id;
const asDevice = (username?: string) => {
  const h: Record<string, string> = { Authorization: `Device ${deviceToken}` };
  if (username) h['X-Operator'] = userId(username);
  return h;
};
const asOwner = () => ({ Authorization: `Bearer ${ownerToken}` });

beforeAll(async () => {
  setPool(new pg.Pool({ connectionString: inject('databaseUrl') }));
  await migrate(pool, () => {});
  await seed(pool, { log: () => {} });
});

afterAll(async () => {
  await pool.end();
});

async function stockOf(name: string): Promise<number> {
  const { rows } = await pool.query(
    'select coalesce(sum(m.qty), 0)::float8 as s from ingredients i left join stock_movements m on m.ingredient_id = i.id where i.name = $1 group by i.id',
    [name],
  );
  return rows[0].s;
}

function makeOrder(productName: string, optionNames: string[], qty: number, overrides: Partial<Order> = {}): Order {
  const product = catalog.products.find((p) => p.name === productName)!;
  const options: OrderItemOption[] = [];
  for (const gid of product.optionGroupIds) {
    const g = catalog.optionGroups.find((x) => x.id === gid)!;
    for (const o of g.options) if (optionNames.includes(o.name)) options.push({ optionId: o.id, groupName: g.name, name: o.name, priceDelta: o.priceDelta });
  }
  const line = priceLine(product.price, options, qty);
  const items = [{ id: randomUUID(), productId: product.id, name: product.name, basePrice: product.price, qty, options, note: '', ...line }];
  const pricing = mergeSettings({}).pricing;
  const totals = computeTotals(items, null, pricing);
  return {
    id: randomUUID(),
    number: `A-TEST-${Math.random().toString(36).slice(2, 8)}`,
    deviceId: 'x',
    shiftId,
    cashierId: userId('kasir'),
    cashierName: 'Kasir 1',
    createdAt: new Date().toISOString(),
    customerName: '',
    orderType: 'dine_in',
    items,
    discount: null,
    servicePct: pricing.servicePct,
    taxPct: 0,
    taxLabel: 'PB1',
    ...totals,
    payment: { method: 'cash', amount: totals.total, tendered: 200000, change: 200000 - totals.total, reference: '' },
    status: 'paid',
    voidReason: '',
    voidedAt: null,
    voidedById: null,
    voidedByName: '',
    voidApprovedById: null,
    ...overrides,
  };
}

describe('autentikasi', () => {
  it('login owner dengan PIN benar, tolak PIN salah', async () => {
    const ok = await request(app).post('/api/auth/login').send({ username: 'owner', pin: '123456' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('owner');
    expect(ok.body.user.pin_hash).toBeUndefined();
    ownerToken = ok.body.token;

    const bad = await request(app).post('/api/auth/login').send({ username: 'owner', pin: '000000' });
    expect(bad.status).toBe(401);
  });

  it('mengunci login setelah 5 kali PIN salah', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ username: 'kitchen', pin: '9999' });
    const locked = await request(app).post('/api/auth/login').send({ username: 'kitchen', pin: '2222' });
    expect(locked.status).toBe(429);
  });

  it('PIN disimpan dalam bentuk hash', async () => {
    const { rows } = await pool.query("select pin_hash from users where username = 'kasir'");
    expect(rows[0].pin_hash).toMatch(/^pbkdf2\$/);
    expect(rows[0].pin_hash).not.toContain('1234$');
  });

  it('hanya owner yang bisa mengaktifkan perangkat kasir', async () => {
    const denied = await request(app).post('/api/devices/pair').send({ username: 'kasir', pin: '1234', name: 'Tablet' });
    expect(denied.status).toBe(403);
    const res = await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Tablet Kasir' });
    expect(res.status).toBe(201);
    expect(res.body.device.code).toBe('A');
    deviceToken = res.body.token;
  });

  it('bootstrap tablet berisi menu, pengaturan, dan hash PIN untuk login offline', async () => {
    const res = await request(app).get('/api/sync/bootstrap').set(asDevice());
    expect(res.status).toBe(200);
    expect(res.body.settings.pricing.servicePct).toBe(5);
    expect(res.body.settings.pricing.taxEnabled).toBe(false);
    expect(res.body.catalog.products.length).toBeGreaterThan(5);
    expect(res.body.users.every((u: { pinHash: string }) => u.pinHash.startsWith('pbkdf2$'))).toBe(true);
    users = res.body.users;
    catalog = res.body.catalog;
  });

  it('token perangkat palsu ditolak', async () => {
    const res = await request(app).get('/api/sync/bootstrap').set({ Authorization: 'Device palsu' });
    expect(res.status).toBe(401);
  });
});

describe('transaksi', () => {
  let order: Order;

  it('menyimpan transaksi dan memotong stok sesuai resep + opsi', async () => {
    const beans = await stockOf('Biji Kopi Arabika');
    const milk = await stockOf('Susu Segar');
    const cups = await stockOf('Cup Plastik 16oz');
    order = makeOrder('Cafe Latte', ['Large', 'Iced', 'Extra Shot'], 2);
    // (32.000 + 5.000 + 6.000) x 2 = 86.000; service 5% = 4.300
    expect(order.total).toBe(90300);

    const res = await request(app).put(`/api/orders/${order.id}`).set(asDevice('kasir')).send(order);
    expect(res.status).toBe(201);

    expect(await stockOf('Biji Kopi Arabika')).toBe(beans - 72); // (18 dasar + 18 extra shot) x 2
    expect(await stockOf('Susu Segar')).toBe(milk - 560); // (200 + 80 large) x 2
    expect(await stockOf('Cup Plastik 16oz')).toBe(cups - 2);
  });

  it('kirim ulang transaksi yang sama tidak membuat duplikat (idempotent)', async () => {
    const beans = await stockOf('Biji Kopi Arabika');
    const res = await request(app).put(`/api/orders/${order.id}`).set(asDevice('kasir')).send(order);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('exists');
    expect(await stockOf('Biji Kopi Arabika')).toBe(beans);
    const { rows } = await pool.query('select count(*)::int as n from orders where id = $1', [order.id]);
    expect(rows[0].n).toBe(1);
  });

  it('menolak total yang dimanipulasi', async () => {
    const bad = makeOrder('Americano', [], 1);
    bad.total = 1000;
    bad.payment.amount = 1000;
    const res = await request(app).put(`/api/orders/${bad.id}`).set(asDevice('kasir')).send(bad);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Total tidak sesuai');
  });

  it('barista tidak boleh membuat transaksi; tanpa perangkat juga ditolak', async () => {
    const o = makeOrder('Americano', [], 1);
    expect((await request(app).put(`/api/orders/${o.id}`).set(asDevice('barista')).send(o)).status).toBe(403);
    expect((await request(app).put(`/api/orders/${o.id}`).set(asOwner()).send(o)).status).toBe(401);
  });

  it('void mengembalikan stok, dan void kedua tidak mengubah apa pun', async () => {
    const beans = await stockOf('Biji Kopi Arabika');
    const body = { reason: 'Salah input', voidedAt: new Date().toISOString(), voidedById: userId('kasir'), voidedByName: 'Kasir 1', approvedById: null };
    const res = await request(app).post(`/api/orders/${order.id}/void`).set(asDevice('kasir')).send(body);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('voided');
    expect(await stockOf('Biji Kopi Arabika')).toBe(beans + 72);

    const again = await request(app).post(`/api/orders/${order.id}/void`).set(asDevice('kasir')).send(body);
    expect(again.body.status).toBe('already-void');
    expect(await stockOf('Biji Kopi Arabika')).toBe(beans + 72);
  });

  it('kebijakan void butuh PIN owner diterapkan di server', async () => {
    await request(app).put('/api/settings').set(asOwner()).send({ policy: { voidRequiresOwnerPin: true } }).expect(200);
    const o = makeOrder('Espresso', ['Hot'], 1);
    await request(app).put(`/api/orders/${o.id}`).set(asDevice('kasir')).send(o).expect(201);
    const body = { reason: 'Pelanggan batal', voidedAt: new Date().toISOString(), voidedById: userId('kasir'), voidedByName: 'Kasir 1', approvedById: null };
    expect((await request(app).post(`/api/orders/${o.id}/void`).set(asDevice('kasir')).send(body)).status).toBe(403);
    const approved = await request(app).post(`/api/orders/${o.id}/void`).set(asDevice('kasir')).send({ ...body, approvedById: userId('owner') });
    expect(approved.status).toBe(200);
    await request(app).put('/api/settings').set(asOwner()).send({ policy: { voidRequiresOwnerPin: false } }).expect(200);
  });

  it('transaksi yang dibatalkan saat offline tersimpan sebagai void dengan stok tidak berkurang', async () => {
    const beans = await stockOf('Biji Kopi Arabika');
    const o = makeOrder('Americano', ['Regular', 'Iced'], 1, {
      status: 'void',
      voidReason: 'Salah menu',
      voidedAt: new Date().toISOString(),
      voidedById: userId('kasir'),
      voidedByName: 'Kasir 1',
    });
    await request(app).put(`/api/orders/${o.id}`).set(asDevice('kasir')).send(o).expect(201);
    expect(await stockOf('Biji Kopi Arabika')).toBe(beans);
    const { rows } = await pool.query('select status, void_reason from orders where id = $1', [o.id]);
    expect(rows[0]).toEqual({ status: 'void', void_reason: 'Salah menu' });
  });
});

describe('shift', () => {
  it('shift yang sudah ditutup tidak bisa diubah lagi', async () => {
    const base = {
      id: shiftId,
      deviceId: 'x',
      openedById: userId('kasir'),
      openedByName: 'Kasir 1',
      openedAt: new Date().toISOString(),
      openingCash: 200000,
      cashMovements: [],
      closedById: null,
      closedByName: '',
      closedAt: null,
      countedCash: null,
      closingNote: '',
      summary: null,
    };
    await request(app).put(`/api/shifts/${shiftId}`).set(asDevice('kasir')).send(base).expect(200);
    const closed = { ...base, closedById: userId('kasir'), closedByName: 'Kasir 1', closedAt: new Date().toISOString(), countedCash: 250000 };
    expect((await request(app).put(`/api/shifts/${shiftId}`).set(asDevice('kasir')).send(closed)).body.status).toBe('saved');
    const tampered = { ...closed, countedCash: 999999 };
    expect((await request(app).put(`/api/shifts/${shiftId}`).set(asDevice('kasir')).send(tampered)).body.status).toBe('closed-unchanged');
    const { rows } = await pool.query('select counted_cash from shifts where id = $1', [shiftId]);
    expect(rows[0].counted_cash).toBe(250000);
  });
});

describe('stok & opname', () => {
  let baristaToken = '';

  it('barista mencatat barang masuk dan memperbarui harga per satuan', async () => {
    baristaToken = (await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' })).body.token;
    const before = await stockOf('Susu Segar');
    const ing = (await request(app).get('/api/ingredients?station=bar').set({ Authorization: `Bearer ${baristaToken}` })).body;
    const milk = ing.find((i: { name: string }) => i.name === 'Susu Segar');
    const res = await request(app)
      .post('/api/stock/movements')
      .set({ Authorization: `Bearer ${baristaToken}` })
      .send({ ingredientId: milk.id, type: 'purchase', qty: 5000, totalCost: 100000, note: 'Belanja pagi' });
    expect(res.status).toBe(201);
    expect(await stockOf('Susu Segar')).toBe(before + 5000);
    const { rows } = await pool.query("select cost_per_unit from ingredients where name = 'Susu Segar'");
    expect(rows[0].cost_per_unit).toBe(20);
  });

  it('barista tidak boleh koreksi stok manual', async () => {
    const ing = (await request(app).get('/api/ingredients').set({ Authorization: `Bearer ${baristaToken}` })).body;
    const res = await request(app)
      .post('/api/stock/movements')
      .set({ Authorization: `Bearer ${baristaToken}` })
      .send({ ingredientId: ing[0].id, type: 'adjust', qty: -10 });
    expect(res.status).toBe(403);
  });

  it('opname mencatat selisih dan menyamakan stok sistem dengan hitungan fisik', async () => {
    const sheet = (await request(app).get('/api/opname/sheet?station=bar').set({ Authorization: `Bearer ${baristaToken}` })).body;
    expect(sheet.items.every((i: { station: string }) => i.station === 'bar')).toBe(true);
    const beans = sheet.items.find((i: { name: string }) => i.name === 'Biji Kopi Arabika');
    const lemon = sheet.items.find((i: { name: string }) => i.name === 'Lemon');
    const id = randomUUID();
    const body = {
      station: 'bar',
      note: 'Opname malam',
      items: [
        { ingredientId: beans.id, countedQty: beans.stock - 40 },
        { ingredientId: lemon.id, countedQty: lemon.stock },
      ],
    };
    const res = await request(app).put(`/api/opname/${id}`).set({ Authorization: `Bearer ${baristaToken}` }).send(body);
    expect(res.status).toBe(201);
    const beansRow = res.body.items.find((i: { name: string }) => i.name === 'Biji Kopi Arabika');
    expect(beansRow.diff).toBe(-40);
    expect(beansRow.diffValue).toBe(-40 * 150);
    expect(await stockOf('Biji Kopi Arabika')).toBe(beans.stock - 40);

    // Kirim ulang: tidak ada selisih ganda
    const again = await request(app).put(`/api/opname/${id}`).set({ Authorization: `Bearer ${baristaToken}` }).send(body);
    expect(again.status).toBe(200);
    expect(await stockOf('Biji Kopi Arabika')).toBe(beans.stock - 40);
  });

  it('kasir tidak bisa melakukan opname', async () => {
    const res = await request(app).get('/api/opname/sheet?station=bar').set(asDevice('kasir'));
    expect(res.status).toBe(403);
  });
});

describe('laporan & admin', () => {
  it('ringkasan hanya menghitung transaksi lunas', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const res = await request(app).get(`/api/reports/summary?from=${today}&to=${today}`).set(asOwner());
    expect(res.status).toBe(200);
    expect(res.body.orderCount).toBe(0);
    expect(res.body.voidCount).toBe(3);

    const o = makeOrder('Matcha Latte', ['Regular', 'Hot'], 3, { payment: undefined as never, orderType: 'take_away' });
    o.payment = { method: 'qris', amount: o.total, tendered: o.total, change: 0, reference: 'QR-1' };
    await request(app).put(`/api/orders/${o.id}`).set(asDevice('kasir')).send(o).expect(201);

    const after = (await request(app).get(`/api/reports/summary?from=${today}&to=${today}`).set(asOwner())).body;
    expect(after.orderCount).toBe(1);
    expect(after.netSales).toBe(o.total);
    expect(after.byMethod).toEqual([{ method: 'qris', label: 'QRIS', count: 1, amount: o.total }]);
    expect(after.topProducts[0]).toMatchObject({ name: 'Matcha Latte', qty: 3 });
    // HPP: 3 x (10 gr matcha x 350 + 200 ml susu x harga susu terbaru 20 + 1 cup x 900) = 3 x 8.400
    expect(after.cogs).toBe(25200);
    expect(after.grossProfit).toBe(o.subtotal - o.discountAmount - 25200);
    expect(after.byOrderType).toEqual([{ type: 'take_away', label: 'Take Away', count: 1, amount: o.total }]);
    expect(after.heatmap).toHaveLength(1);
    expect(after.slowMovers.some((p: { name: string }) => p.name === 'Croissant Butter')).toBe(true);

    const csv = await request(app).get(`/api/reports/orders.csv?from=${today}&to=${today}`).set(asOwner());
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Matcha Latte');
    expect(csv.text).toContain('VOID');
  });

  it('kasir tidak bisa membuka laporan atau mengubah menu', async () => {
    expect((await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-01-02').set(asDevice('kasir'))).status).toBe(403);
    expect((await request(app).post('/api/categories').set(asDevice('kasir')).send({ name: 'X' })).status).toBe(403);
  });

  it('kasir boleh menandai menu habis', async () => {
    const p = catalog.products[0];
    await request(app).post(`/api/products/${p.id}/sold-out`).set(asDevice('kasir')).send({ soldOut: true }).expect(200);
    const boot = (await request(app).get('/api/sync/bootstrap').set(asDevice())).body;
    expect(boot.catalog.products.find((x: { id: string }) => x.id === p.id).soldOut).toBe(true);
  });

  it('tidak bisa menonaktifkan owner terakhir', async () => {
    const res = await request(app).patch(`/api/users/${userId('owner')}`).set(asOwner()).send({ active: false });
    expect(res.status).toBe(400);
  });

  it('owner menyimpan resep dan melihat HPP', async () => {
    const p = catalog.products.find((x) => x.name === 'Americano')!;
    const ings = (await request(app).get('/api/ingredients').set(asOwner())).body;
    const beans = ings.find((i: { name: string }) => i.name === 'Biji Kopi Arabika');
    await request(app).put(`/api/recipes/${p.id}`).set(asOwner()).send({ lines: [{ optionId: null, ingredientId: beans.id, qty: 20 }] }).expect(200);
    const summary = (await request(app).get('/api/recipes').set(asOwner())).body;
    const row = summary.find((r: { productId: string }) => r.productId === p.id);
    expect(row.cost).toBe(3000);
    expect(row.marginPct).toBe(88);
  });
});

describe('hari usaha dan arsip terminal kasir', () => {
  const buildDay = (): BusinessDay => ({
    id: randomUUID(), deviceId: 'client', businessDate: '2026-10-06', openedAt: '2026-10-06T00:00:00.000Z',
    openedById: userId('kasir'), openedByName: 'Kasir 1', closedAt: null, closedById: null,
    closedByName: '', closingNote: '', shiftIds: [], summary: null,
  });
  const buildShift = (day: BusinessDay): Shift => ({
    id: randomUUID(), deviceId: 'client', businessDayId: day.id, openedAt: day.openedAt, openedById: userId('kasir'),
    openedByName: 'Kasir 1', openingCash: 100000, cashMovements: [], closedAt: null, closedById: null,
    closedByName: '', countedCash: null, closingNote: '', summary: null,
  });
  const closedDay = (day: BusinessDay, shift: Shift): BusinessDay => ({
    ...day, closedAt: '2026-10-06T16:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1',
    shiftIds: [shift.id], summary: computeBusinessDaySummary([shift]),
  });

  it('tutup hari dan retry idempotent; shift/hari tertutup tidak dibuka kembali', async () => {
    const day = buildDay(); const base = buildShift(day);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(day).expect(200);
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(base).expect(200);
    const shift = { ...base, closedAt: '2026-10-06T15:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 100000, summary: computeShiftSummary(base, []), closeMode: 'day' as const };
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(shift).expect(200);
    const closed = closedDay(day, shift);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closed).expect(200);
    const retry = await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send({ ...closed, closingNote: 'Jangan menulis ulang' });
    expect(retry.body.status).toBe('closed-unchanged');
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(day).expect(200);
    const result = await pool.query('select payload from business_days where id=$1', [day.id]);
    expect(result.rows[0].payload.closedAt).toBe(closed.closedAt);
    expect(result.rows[0].payload.closingNote).toBe('');
    const newShift = buildShift(day);
    await request(app).put(`/api/shifts/${newShift.id}`).set(asDevice('kasir')).send(newShift).expect(400);
  });

  it('menolak finalisasi ketika order tertutup belum tersinkron; berhasil sesudah order masuk', async () => {
    const day = buildDay(); const base = buildShift(day);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(day).expect(200);
    const order = makeOrder('Americano', [], 1, { shiftId: base.id });
    const shift = { ...base, closedAt: '2026-10-06T15:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 100000 + order.total, summary: computeShiftSummary(base, [order]) };
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(shift).expect(200);
    const closed = closedDay(day, shift);
    const rejected = await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closed);
    expect(rejected.status).toBe(400); expect(rejected.body.error).toContain('belum lengkap');
    await request(app).put(`/api/orders/${order.id}`).set(asDevice('kasir')).send(order).expect(201);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closed).expect(200);
  });

  it('menolak rekap hari yang dimanipulasi', async () => {
    const day = buildDay(); const base = buildShift(day);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(day).expect(200);
    const shift = { ...base, closedAt: '2026-10-06T15:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 100000, summary: computeShiftSummary(base, []) };
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(shift).expect(200);
    const closed = closedDay(day, shift); closed.summary!.netSales = 999;
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closed).expect(400);
  });

  it('arsip kasir dibatasi terminal, tidak membuka permission laporan admin', async () => {
    const own = await request(app).get('/api/tablet/shift-history?from=2026-01-01&to=2026-12-31').set(asDevice('kasir'));
    expect(own.status).toBe(200); expect(own.body.days.length).toBeGreaterThan(0);
    await request(app).get('/api/tablet/shift-history?from=2026-01-01&to=2026-12-31').set(asDevice('barista')).expect(403);
    await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-12-31').set(asDevice('kasir')).expect(403);
    const other = await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Terminal lain untuk tes' });
    const headers = { Authorization: `Device ${other.body.token}`, 'X-Operator': userId('kasir') };
    const archive = await request(app).get('/api/tablet/shift-history?from=2026-01-01&to=2026-12-31').set(headers);
    expect(archive.body.days).toHaveLength(0); expect(archive.body.shifts).toHaveLength(0);
    const day = own.body.days[0];
    await request(app).put(`/api/business-days/${day.id}`).set(headers).send(day).expect(400);
  });
});

describe('master kasir dan arsip transaksi terminal', () => {
  it('master opsional disimpan/disinkronkan tanpa mengubah pengaturan existing; kasir tidak boleh mengedit', async () => {
    const before = (await request(app).get('/api/settings').set(asOwner())).body;
    const pos = { tables: ['Meja 1', 'Meja 2'], notes: [{ text: 'Tanpa gula', categoryId: catalog.categories[0].id }], cancellationReasons: [{ text: 'Pesanan ganda', kind: 'order' }], productStations: { [catalog.products[0].id]: 'bar' } };
    await request(app).put('/api/settings').set(asDevice('kasir')).send({ pos }).expect(403);
    const saved = await request(app).put('/api/settings').set(asOwner()).send({ pos }).expect(200);
    expect(saved.body.pricing).toEqual(before.pricing); expect(saved.body.policy).toEqual(before.policy);
    const bootstrap = await request(app).get('/api/sync/bootstrap').set(asDevice());
    expect(bootstrap.body.settings.pos).toEqual(pos);
    await request(app).put('/api/settings').set(asOwner()).send({ pos: { tables: ['A', 'a'] } }).expect(400);
  });

  it('arsip memakai cursor waktu/ID tanpa duplikat, menyimpan meja/pax dan memisahkan terminal/role', async () => {
    for (let i = 0; i < 101; i++) {
      const order = makeOrder('Americano', ['Hot'], 1, { createdAt: '2020-01-02T05:00:00.000Z', customerName: 'ArchiveFixture', tableName: 'Meja 2', pax: 3 });
      await request(app).put(`/api/orders/${order.id}`).set(asDevice('kasir')).send(order).expect(201);
    }
    const url = '/api/tablet/orders?from=2020-01-02&to=2020-01-02&q=ArchiveFixture&payment=cash';
    const first = await request(app).get(url).set(asDevice('kasir')).expect(200);
    expect(first.body.orders).toHaveLength(100); expect(first.body.next).toBeTruthy(); expect(first.body.orders[0].tableName).toBe('Meja 2'); expect(first.body.orders[0].pax).toBe(3);
    const next = new URLSearchParams({ cursorAt: first.body.next.at, cursorId: first.body.next.id });
    const last = await request(app).get(`${url}&${next}`).set(asDevice('kasir')).expect(200);
    expect(last.body.orders).toHaveLength(1); expect(last.body.next).toBeNull();
    expect(new Set([...first.body.orders, ...last.body.orders].map((o: Order) => o.id)).size).toBe(101);
    await request(app).get(url).set(asDevice('barista')).expect(403);
    await request(app).get(url).set(asOwner()).expect(401);
    const other = await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Terminal arsip lain' }).expect(201);
    const isolated = await request(app).get(url).set({ Authorization: `Device ${other.body.token}`, 'X-Operator': userId('kasir') }).expect(200);
    expect(isolated.body.orders).toHaveLength(0);
    await request(app).get('/api/tablet/orders?from=2020-01-03&to=2020-01-02').set(asDevice('kasir')).expect(400);
  });
});
