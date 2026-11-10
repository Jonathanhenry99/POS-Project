import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { computeTotals, computeShiftSummary, computeBusinessDaySummary, mergeSettings, priceLine, type BusinessDay, type Catalog, type Order, type OrderItemOption, type Shift } from '@mourden/shared';
import { createApp } from '../src/app';
import { pool, setPool } from '../src/db';
import { migrate } from '../src/migrate';
import { drainNotifications, setTransport } from '../src/notify';
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

  it('kasir tidak bisa login lewat jalur HP (hanya dari tablet kasir)', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'kasir', pin: '1234' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('tablet kasir');
    expect(res.body.token).toBeUndefined();
  });

  it('hanya satu tablet kasir aktif secara default; perangkat lain ditolak sampai batas dinaikkan', async () => {
    const blocked = await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'HP lain' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('Tablet Kasir');
    // Tes berikutnya memakai beberapa terminal: naikkan batas.
    await request(app).put('/api/settings').set(asOwner()).send({ policy: { maxDevices: 5 } }).expect(200);
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

  it('perangkat uji owner: hanya owner, tidak memakan jatah tablet, token lama hangus saat diminta ulang', async () => {
    await request(app).post('/api/devices/test').set(asDevice('kasir')).expect(403);
    const before = (await request(app).get('/api/devices').set(asOwner())).body.filter((d: { revokedAt: string | null; isTest: boolean }) => !d.revokedAt && !d.isTest).length;
    const a = (await request(app).post('/api/devices/test').set(asOwner()).expect(201)).body;
    const b = (await request(app).post('/api/devices/test').set(asOwner()).expect(201)).body;
    expect(b.device.id).toBe(a.device.id); expect(b.token).not.toBe(a.token);
    const owner = (await request(app).get('/api/users').set(asOwner())).body.find((u: { role: string }) => u.role === 'owner');
    await request(app).get('/api/sync/bootstrap').set({ Authorization: `Device ${a.token}`, 'X-Operator': owner.id }).expect(401);
    await request(app).get('/api/sync/bootstrap').set({ Authorization: `Device ${b.token}`, 'X-Operator': owner.id }).expect(200);
    const list = (await request(app).get('/api/devices').set(asOwner())).body;
    expect(list.filter((d: { isTest: boolean }) => d.isTest)).toHaveLength(1);
    expect(list.filter((d: { revokedAt: string | null; isTest: boolean }) => !d.revokedAt && !d.isTest).length).toBe(before);
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

describe('tutup kasir: settlement EDC & foto bukti', () => {
  it('angka settlement tersimpan bersama shift, foto bukti idempotent dan hanya owner yang bisa melihat, selisih masuk tinjauan', async () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const summary = { orderCount: 2, voidCount: 0, voidAmount: 0, grossSales: 126000, discountTotal: 0, serviceTotal: 6300, taxTotal: 0, netSales: 132300, byMethod: { cash: 0, qris: 132300, card: 0 }, cashIn: 0, cashOut: 0, expectedCash: 100000 };
    const shift = { id, deviceId: 'x', openedById: userId('kasir'), openedByName: 'Kasir 1', openedAt: now, openingCash: 100000, cashMovements: [], closedById: userId('kasir'), closedByName: 'Kasir 1', closedAt: now, countedCash: 100000, closingNote: '', summary, settlement: { qris: 100000, card: null } };
    expect((await request(app).put(`/api/shifts/${id}`).set(asDevice('kasir')).send(shift)).body.status).toBe('saved');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const proofId = randomUUID();
    for (let i = 0; i < 2; i++) await request(app).put(`/api/tablet/shift-proofs/${proofId}`).set(asDevice('kasir')).send({ shiftId: id, kind: 'edc', dataUrl: png }).expect(200);
    await request(app).put(`/api/tablet/shift-proofs/${randomUUID()}`).set(asDevice('kasir')).send({ shiftId: id, kind: 'cash', dataUrl: png }).expect(200);
    await request(app).put(`/api/tablet/shift-proofs/${randomUUID()}`).set(asDevice('kasir')).send({ shiftId: id, kind: 'edc', dataUrl: 'data:text/html;base64,PGgxPg==' }).expect(400);
    await request(app).put(`/api/tablet/shift-proofs/${randomUUID()}`).set(asOwner()).send({ shiftId: id, kind: 'edc', dataUrl: png }).expect(401);
    const list = (await request(app).get('/api/shifts?from=2000-01-01&to=2100-01-01').set(asOwner()).expect(200)).body;
    const saved = list.find((s: { id: string }) => s.id === id);
    expect(saved.settlement).toEqual({ qris: 100000, card: null });
    expect(saved.proofs.map((p: { kind: string }) => p.kind).sort()).toEqual(['cash', 'edc']);
    const img = await request(app).get(`/api/shift-proofs/${proofId}`).set(asOwner()).expect(200);
    expect(img.headers['content-type']).toContain('image/png'); expect(img.body.length).toBeGreaterThan(20);
    await request(app).get(`/api/shift-proofs/${proofId}`).set(asDevice('kasir')).expect(403);
    const review = (await request(app).get('/api/reports/review?from=2000-01-01&to=2100-01-01').set(asOwner())).body;
    expect(review.items.find((i: { key: string }) => i.key === `settle:${id}:qris`)).toMatchObject({ kind: 'settlement', severity: 'high', title: 'Settlement QRIS kurang Rp 32.300' });
    expect((await request(app).put('/api/settings').set(asOwner()).send({ policy: { requireClosingProof: true } }).expect(200)).body.policy.requireClosingProof).toBe(true);
    await request(app).put('/api/settings').set(asOwner()).send({ policy: { requireClosingProof: false } }).expect(200);
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
    // Hitungan buta: lembar barista tidak memuat angka stok sistem sama sekali; owner tetap melihatnya.
    const blind = (await request(app).get('/api/opname/sheet?station=bar').set({ Authorization: `Bearer ${baristaToken}` })).body;
    expect(blind.items.length).toBeGreaterThan(0);
    expect(blind.items.every((i: { stock: unknown; avgDailyUsage: unknown; daysLeft: unknown }) => i.stock === null && i.avgDailyUsage === null && i.daysLeft === null)).toBe(true);
    const blindList = (await request(app).get('/api/ingredients?station=bar').set({ Authorization: `Bearer ${baristaToken}` })).body;
    expect(blindList.every((i: { stock: unknown; status: string }) => i.stock === null && typeof i.status === 'string')).toBe(true);
    const sheet = (await request(app).get('/api/opname/sheet?station=bar').set(asOwner())).body;
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

  it('opname dengan kemasan: segel x isi bersih + (timbangan - berat wadah), dihitung server dan rinciannya tersimpan', async () => {
    const auth = { Authorization: `Bearer ${baristaToken}` };
    const list = (await request(app).get('/api/opname/sheet?station=bar').set(asOwner())).body.items;
    const susu = list.find((i: { name: string }) => i.name === 'Susu Segar');
    await request(app).patch(`/api/ingredients/${susu.id}`).set(asOwner()).send({ packSize: 946, containerWeight: 30 }).expect(200);
    const cfg = (await request(app).get('/api/opname/sheet?station=bar').set(auth)).body.items.find((i: { id: string }) => i.id === susu.id);
    expect(cfg).toMatchObject({ packSize: 946, containerWeight: 30 });
    // Berat timbangan lebih kecil dari berat wadah ditolak, tidak ada yang tersimpan.
    await request(app).put(`/api/opname/${randomUUID()}`).set(auth).send({ station: 'bar', items: [{ ingredientId: susu.id, countedQty: 0, breakdown: { sealed: 0, gross: 20, containers: 1 } }] }).expect(400);
    // Angka kiriman (1) diabaikan: server menghitung 10 x 946 + (280 - 30) = 9.710.
    const id = randomUUID();
    const res = await request(app).put(`/api/opname/${id}`).set(auth).send({ station: 'bar', items: [{ ingredientId: susu.id, countedQty: 1, breakdown: { sealed: 10, gross: 280, containers: 1 } }] }).expect(201);
    expect(res.body.items[0]).toMatchObject({ countedQty: 9710, detail: { sealed: 10, gross: 280, containers: 1, packSize: 946, containerWeight: 30, sealedQty: 9460, openQty: 250, tare: 30 } });
    expect(await stockOf('Susu Segar')).toBe(9710);
    await request(app).patch(`/api/ingredients/${susu.id}`).set({ Authorization: `Bearer ${baristaToken}` }).send({ packSize: 1 }).expect(403);
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

  it('ringkasan memuat kinerja kasir, jumlah item dan transaksi terbaru; analisa menu & denyut target tersedia untuk owner', async () => {
    const t = new Date().toISOString().slice(0, 10);
    const from = '2000-01-01'; const to = '2100-01-01';
    const s = (await request(app).get(`/api/reports/summary?from=${from}&to=${to}`).set(asOwner()).expect(200)).body;
    expect(s.byCashier.reduce((n: number, c: { amount: number }) => n + c.amount, 0)).toBe(s.netSales);
    expect(s.byCashier.reduce((n: number, c: { voidCount: number }) => n + c.voidCount, 0)).toBe(s.voidCount);
    expect(s.itemCount).toBeGreaterThan(0);
    expect(s.recentOrders.length).toBeGreaterThan(0);
    expect(s.recentOrders[0]).toHaveProperty('methodLabel');
    const matrix = (await request(app).get(`/api/reports/menu-matrix?from=${from}&to=${to}`).set(asOwner()).expect(200)).body;
    expect(matrix.rows.length).toBe(catalog.products.length);
    expect(matrix.rows.reduce((n: number, r: { qty: number }) => n + r.qty, 0)).toBe(matrix.totalQty);
    expect(['star', 'plowhorse', 'puzzle', 'dog']).toContain(matrix.rows[0].quadrant);
    await request(app).put('/api/settings').set(asOwner()).send({ goals: { monthlySales: 50_000_000 } }).expect(200);
    await request(app).put('/api/settings').set(asOwner()).send({ goals: { monthlySales: -1 } }).expect(400);
    const pulse = (await request(app).get('/api/reports/pulse').set(asOwner()).expect(200)).body;
    expect(pulse.target).toBe(50_000_000);
    expect(pulse.today.slice(0, 7)).toBe(t.slice(0, 7));
    expect(pulse.dayOfMonth).toBeLessThanOrEqual(pulse.daysInMonth);
    expect(pulse.monthRevenue).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(pulse.heatmap) && Array.isArray(pulse.last14)).toBe(true);
    await request(app).get('/api/reports/pulse').set(asDevice('kasir')).expect(403);
    await request(app).get(`/api/reports/menu-matrix?from=${from}&to=${to}`).set(asDevice('kasir')).expect(403);
  });

  it('perlu ditinjau: aktivitas tablet tercatat sekali, tersaring bertingkat risiko, bisa ditandai; kasir tidak boleh melihat', async () => {
    const t = new Date().toISOString();
    const ev = (type: string, extra: Record<string, unknown> = {}) => ({ id: randomUUID(), at: t, type, orderRef: 'ord-tinjau', label: 'Meja 9', amount: 58000, itemCount: 2, billPrints: 0, reason: '', detail: '', ...extra });
    const bill1 = ev('bill_printed'); const bill2 = ev('bill_printed'); const del = ev('order_deleted', { billPrints: 2, reason: 'pelanggan batal' });
    for (const e of [bill1, bill2, del, del]) await request(app).put(`/api/tablet/events/${e.id}`).set(asDevice('kasir')).send(e).expect(200);
    await request(app).put(`/api/tablet/events/${randomUUID()}`).set(asDevice('kasir')).send(del).expect(400);
    await request(app).put(`/api/tablet/events/${del.id}`).set(asOwner()).send(del).expect(401);
    const url = '/api/reports/review?from=2000-01-01&to=2100-01-01';
    await request(app).get(url).set(asDevice('kasir')).expect(403);
    const r = (await request(app).get(url).set(asOwner()).expect(200)).body;
    const deleted = r.items.filter((i: { key: string }) => i.key === `event:${del.id}`);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ severity: 'high', actor: 'Kasir 1', reviewed: false });
    expect(r.items.find((i: { key: string }) => i.key === 'bill:ord-tinjau')).toMatchObject({ kind: 'bill_reprint', title: 'Tagihan dicetak 2 kali' });
    expect(r.items.some((i: { kind: string }) => i.kind === 'void')).toBe(true);
    expect(r.open).toBe(r.items.length); expect(r.high).toBeGreaterThan(0);
    await request(app).post('/api/reports/review/mark').set(asOwner()).send({ keys: [`event:${del.id}`], reviewed: true }).expect(200);
    const after = (await request(app).get(url).set(asOwner())).body;
    expect(after.open).toBe(r.open - 1);
    expect(after.items.find((i: { key: string }) => i.key === `event:${del.id}`).reviewed).toBe(true);
    await request(app).post('/api/reports/review/mark').set(asOwner()).send({ keys: [`event:${del.id}`], reviewed: false }).expect(200);
    await request(app).post('/api/reports/review/mark').set(asDevice('kasir')).send({ keys: ['x:1'], reviewed: true }).expect(403);
    const s = await request(app).put('/api/settings').set(asOwner()).send({ policy: { blindCashClose: false } }).expect(200);
    expect(s.body.policy.blindCashClose).toBe(false);
    await request(app).put('/api/settings').set(asOwner()).send({ policy: { blindCashClose: true } }).expect(200);
  });

  it('komplimen karyawan: Rp 0 atas nama penerima, bahan tetap terpotong, terpisah dari penjualan, melebihi jatah masuk tinjauan', async () => {
    const range = 'from=2000-01-01&to=2100-01-01';
    const before = (await request(app).get(`/api/reports/summary?${range}`).set(asOwner())).body;
    const beans = await stockOf('Biji Kopi Arabika');
    const compOrder = (extra: Partial<Order> = {}) => {
      const base = makeOrder('Americano', ['Hot'], 1);
      const discount = { type: 'percent' as const, value: 100, reason: 'Komplimen Barista' };
      const totals = computeTotals(base.items, discount, mergeSettings({}).pricing);
      return { ...base, discount, ...totals, payment: { method: 'cash' as const, amount: 0, tendered: 0, change: 0, reference: '' }, comp: { employeeId: userId('barista'), employeeName: 'Barista', approvedById: null }, ...extra };
    };
    const first = compOrder();
    expect(first.total).toBe(0);
    await request(app).put(`/api/orders/${first.id}`).set(asDevice('kasir')).send(first).expect(201);
    // Komplimen yang masih bernilai uang ditolak.
    const paid = { ...makeOrder('Americano', ['Hot'], 1), comp: { employeeId: userId('barista'), employeeName: 'Barista', approvedById: null } };
    await request(app).put(`/api/orders/${paid.id}`).set(asDevice('kasir')).send(paid).expect(400);
    expect(await stockOf('Biji Kopi Arabika')).toBeLessThan(beans);
    const after = (await request(app).get(`/api/reports/summary?${range}`).set(asOwner())).body;
    expect(after.orderCount).toBe(before.orderCount); expect(after.grossSales).toBe(before.grossSales); expect(after.discountTotal).toBe(before.discountTotal);
    // Komplimen kedua di hari yang sama melebihi jatah bawaan (1 per hari).
    const second = compOrder();
    await request(app).put(`/api/orders/${second.id}`).set(asDevice('kasir')).send(second).expect(201);
    const comps = (await request(app).get(`/api/reports/comps?${range}`).set(asOwner()).expect(200)).body;
    expect(comps.totals).toMatchObject({ orders: 2, qty: 2 }); expect(comps.totals.cost).toBeGreaterThan(0);
    expect(comps.byEmployee[0]).toMatchObject({ name: 'Barista', qty: 2, overDays: 1 });
    expect(comps.byEmployee[0].items[0]).toMatchObject({ name: 'Americano', qty: 2 });
    // Hanya pengambilan kedua yang melewati jatah; yang pertama tetap sesuai.
    expect(comps.list.map((c: { id: string; overQuota: boolean }) => [c.id, c.overQuota])).toEqual([[second.id, true], [first.id, false]]);
    const review = (await request(app).get(`/api/reports/review?${range}`).set(asOwner())).body;
    const flagged = review.items.filter((i: { kind: string }) => i.kind === 'comp');
    expect(flagged).toHaveLength(1); expect(flagged[0]).toMatchObject({ key: `comp:${second.id}`, severity: 'high' });
    expect(review.items.some((i: { kind: string; detail: string }) => i.kind === 'discount' && i.detail.includes(first.number))).toBe(false);
    const variance = (await request(app).get(`/api/reports/stock-variance?${range}`).set(asOwner()).expect(200)).body;
    const kopi = variance.rows.find((r: { name: string }) => r.name === 'Biji Kopi Arabika');
    expect(kopi.compQty).toBeGreaterThan(0); expect(kopi.usageQty).toBeCloseTo(kopi.soldQty + kopi.compQty);
    expect(variance.defaultTolerancePct).toBe(3);
    await request(app).get(`/api/reports/stock-variance?${range}`).set(asDevice('kasir')).expect(403);
    const saved = await request(app).put('/api/settings').set(asOwner()).send({ comp: { perDay: 2 }, stock: { tolerancePct: 5 } }).expect(200);
    expect(saved.body.comp).toEqual({ enabled: true, perDay: 2, maxUnitPrice: 0 });
    expect((await request(app).get(`/api/reports/review?${range}`).set(asOwner())).body.items.some((i: { kind: string }) => i.kind === 'comp')).toBe(false);
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

  it('hapus menu: hilang dari menu owner, tablet dan resep; riwayat penjualan tetap ada; hanya owner', async () => {
    const cat = catalog.categories[0];
    const created = await request(app).post('/api/products').set(asOwner()).send({ categoryId: cat.id, name: 'Menu Musiman Lama', price: 22000, optionGroupIds: [] }).expect(201);
    const id = created.body.id as string;
    const milk = (await request(app).get('/api/ingredients?all=1').set(asOwner())).body.find((i: { name: string }) => i.name === 'Susu Segar');
    await request(app).put(`/api/recipes/${id}`).set(asOwner()).send({ lines: [{ optionId: null, ingredientId: milk.id, qty: 100 }] }).expect(200);
    const line = priceLine(22000, [], 1);
    const items = [{ id: randomUUID(), productId: id, name: 'Menu Musiman Lama', basePrice: 22000, qty: 1, options: [], note: '', ...line }];
    const totals = computeTotals(items, null, mergeSettings({}).pricing);
    const order = { ...makeOrder('Americano', [], 1), items, ...totals, payment: { method: 'cash' as const, amount: totals.total, tendered: totals.total, change: 0, reference: '' } };
    await request(app).put(`/api/orders/${order.id}`).set(asDevice('kasir')).send(order).expect(201);

    const usage = await request(app).get(`/api/products/${id}/usage`).set(asOwner()).expect(200);
    expect(usage.body.orderCount).toBe(1);
    expect(usage.body.lastSoldAt).toBeTruthy();
    await request(app).delete(`/api/products/${id}`).set(asDevice('kasir')).expect(403);
    await request(app).delete(`/api/products/${id}`).set(asOwner()).expect(200);

    const has = (list: { id?: string; productId?: string }[]) => list.some((x) => (x.id ?? x.productId) === id);
    expect(has((await request(app).get('/api/admin/catalog').set(asOwner())).body.products)).toBe(false);
    expect(has((await request(app).get('/api/sync/bootstrap').set(asDevice())).body.catalog.products)).toBe(false);
    expect(has((await request(app).get('/api/recipes').set(asOwner())).body)).toBe(false);
    // Tidak bisa diubah, ditandai habis, atau dihapus dua kali.
    await request(app).patch(`/api/products/${id}`).set(asOwner()).send({ active: true }).expect(404);
    await request(app).post(`/api/products/${id}/sold-out`).set(asDevice('kasir')).send({ soldOut: true }).expect(404);
    await request(app).delete(`/api/products/${id}`).set(asOwner()).expect(404);
    // Riwayat: transaksi, nama item dan resepnya masih tersimpan.
    const kept = await pool.query('select oi.name, (select count(*)::int from recipe_items where product_id = $1) as recipe from order_items oi where oi.product_id = $1', [id]);
    expect(kept.rows).toEqual([{ name: 'Menu Musiman Lama', recipe: 1 }]);
    const logged = await pool.query("select data from audit_log where entity = 'product' and action = 'delete' and entity_id = $1", [id]);
    expect(logged.rows[0].data).toEqual({ name: 'Menu Musiman Lama' });
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

  it('tutup hari berhasil untuk shift yang berisi komplimen karyawan (dihitung terpisah dari transaksi)', async () => {
    const day = buildDay(); const base = buildShift(day);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(day).expect(200);
    const sale = makeOrder('Americano', [], 1, { shiftId: base.id });
    const free = makeOrder('Americano', [], 1, { shiftId: base.id });
    const discount = { type: 'percent' as const, value: 100, reason: 'Komplimen Barista' };
    const comp = { ...free, discount, ...computeTotals(free.items, discount, mergeSettings({}).pricing), payment: { method: 'cash' as const, amount: 0, tendered: 0, change: 0, reference: '' }, comp: { employeeId: userId('barista'), employeeName: 'Barista', approvedById: userId('owner') } };
    const summary = computeShiftSummary(base, [sale, comp]);
    expect(summary).toMatchObject({ orderCount: 1, compCount: 1 });
    for (const o of [sale, comp]) await request(app).put(`/api/orders/${o.id}`).set(asDevice('kasir')).send(o).expect(201);
    const shift = { ...base, closedAt: '2026-10-06T15:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 100000 + sale.total, summary };
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(shift).expect(200);
    const res = await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closedDay(day, shift));
    expect(res.body.error).toBeUndefined(); expect(res.status).toBe(200);
    // Komplimen yang belum tersinkron tetap membuat finalisasi ditolak (pengaman tidak dilonggarkan).
    const day2 = buildDay(); const base2 = buildShift(day2);
    await request(app).put(`/api/business-days/${day2.id}`).set(asDevice('kasir')).send(day2).expect(200);
    const shift2 = { ...base2, closedAt: '2026-10-06T15:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 100000, summary: computeShiftSummary(base2, [{ ...comp, id: randomUUID(), shiftId: base2.id }]) };
    await request(app).put(`/api/shifts/${base2.id}`).set(asDevice('kasir')).send(shift2).expect(200);
    await request(app).put(`/api/business-days/${day2.id}`).set(asDevice('kasir')).send(closedDay(day2, shift2)).expect(400);
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

  it('logo & bentuk struk: disimpan owner, ikut bootstrap tablet, tampil di /brand tanpa login, tidak disalin ke audit', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const receipt = { showLogo: true, logoSize: 'large', showCashier: false, headerNote: 'Wi-Fi: mourden' };
    await request(app).put('/api/settings').set(asDevice('kasir')).send({ brand: { logo } }).expect(403);
    await request(app).put('/api/settings').set(asOwner()).send({ brand: { logo: 'data:text/html;base64,PGgxPg==' } }).expect(400);
    const saved = await request(app).put('/api/settings').set(asOwner()).send({ brand: { logo }, receipt, pricing: { serviceEnabled: false } }).expect(200);
    expect(saved.body.receipt).toMatchObject({ ...receipt, showStoreName: true, logoDarkness: 'normal' });
    expect(saved.body.pricing.serviceEnabled).toBe(false);
    const bootstrap = await request(app).get('/api/sync/bootstrap').set(asDevice());
    expect(bootstrap.body.settings.brand.logo).toBe(logo);
    expect(bootstrap.body.settings.receipt.logoSize).toBe('large');
    const brand = await request(app).get('/api/brand').expect(200);
    expect(brand.body).toEqual({ name: saved.body.store.name, logo });
    const { rows } = await pool.query(`select data from audit_log where entity = 'settings' order by at desc, id desc limit 1`);
    expect(JSON.stringify(rows[0].data)).not.toContain('iVBOR');
    await request(app).put('/api/settings').set(asOwner()).send({ brand: { logo: '' }, pricing: { serviceEnabled: true } }).expect(200);
    expect((await request(app).get('/api/brand')).body.logo).toBe('');
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

describe('notifikasi WhatsApp', () => {
  const KEY = 'KUNCI987';
  const sent: { phone: string; apikey: string; text: string }[] = [];
  let fail = false;
  let recipientId = '';
  let ingId = '';
  const texts = (prefix: string) => sent.map((m) => m.text).filter((t) => t.startsWith(prefix));
  const move = async (type: 'waste' | 'purchase', qty: number) => {
    await request(app).post('/api/stock/movements').set(asOwner()).send({ ingredientId: ingId, type, qty, note: 'tes notif' }).expect(201);
    await drainNotifications();
  };
  const soldOut = async (index: number, value: boolean) => {
    await request(app).post(`/api/products/${catalog.products[index].id}/sold-out`).set(asDevice('kasir')).send({ soldOut: value }).expect(200);
    await drainNotifications();
  };

  beforeAll(() => {
    setTransport(async (to, text) => {
      if (fail) return { ok: false, detail: 'APIKey is invalid.' };
      sent.push({ ...to, text });
      return { ok: true, detail: '' };
    });
  });
  afterAll(async () => {
    await drainNotifications();
    setTransport(null);
  });

  it('penerima disimpan owner, nomor dirapikan, kunci tidak pernah keluar (API, bootstrap tablet, audit); tes kirim langsung', async () => {
    await request(app).get('/api/notify').set(asDevice('kasir')).expect(403);
    await request(app).post('/api/notify/recipients').set(asOwner()).send({ name: 'Owner', phone: '12ab', apikey: KEY }).expect(400);
    const created = await request(app).post('/api/notify/recipients').set(asOwner()).send({ name: 'Owner', phone: '0812-3456-7890', apikey: KEY }).expect(201);
    recipientId = created.body.id;
    expect(created.body).toEqual({ id: recipientId, name: 'Owner', phone: '+6281234567890', active: true });
    const page = await request(app).get('/api/notify').set(asOwner()).expect(200);
    expect(page.body.toggles).toEqual({ soldOut: true, lowStock: true, dayClose: true, approval: true, attendance: true });
    const boot = await request(app).get('/api/sync/bootstrap').set(asDevice());
    const settings = await request(app).get('/api/settings').set(asDevice('kasir'));
    const audit = await pool.query("select data from audit_log where entity = 'notify-recipient'");
    for (const leak of [page.text, boot.text, settings.text, JSON.stringify(audit.rows)]) expect(leak).not.toContain(KEY);
    expect(boot.text).not.toContain('6281234567890');

    const test = await request(app).post(`/api/notify/recipients/${recipientId}/test`).set(asOwner()).expect(200);
    expect(test.body).toEqual({ ok: true, detail: '' });
    expect(sent[0]).toMatchObject({ phone: '+6281234567890', apikey: KEY });
    expect(sent[0].text).toContain('Tes notifikasi');
  });

  it('menu ditandai habis: dikabarkan sekali saat berubah, bukan saat dikirim ulang', async () => {
    await soldOut(1, false);
    await soldOut(1, true);
    await soldOut(1, true);
    expect(texts('*Menu habis')).toHaveLength(1);
    expect(texts('*Menu habis')[0]).toContain(catalog.products[1].name);
    expect(texts('*Menu habis')[0]).toContain('Ditandai oleh Kasir 1');
    await soldOut(1, false);
    await soldOut(1, true);
    expect(texts('*Menu habis')).toHaveLength(2);
    await soldOut(1, false);
  });

  it('bahan: dikabarkan saat turun ke bawah minimum, lagi saat habis, dan diam sampai stok pulih', async () => {
    const res = await request(app).post('/api/ingredients').set(asOwner()).send({ name: 'Sirup Tes Notif', unit: 'ml', station: 'bar', minStock: 50, costPerUnit: 10, initialStock: 100 }).expect(201);
    ingId = res.body.id;
    await drainNotifications();
    const mine = () => texts('*Stok bahan').filter((t) => t.includes('Sirup Tes Notif'));
    expect(mine()).toHaveLength(0);
    await move('waste', 60);
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toContain('Di bawah minimum:\n- Sirup Tes Notif: sisa 40 ml, minimum 50');
    await move('waste', 10);
    expect(mine()).toHaveLength(1);
    await move('waste', 30);
    expect(mine()).toHaveLength(2);
    expect(mine()[1]).toContain('HABIS:\n- Sirup Tes Notif (sisa 0 ml)');
    await move('purchase', 200);
    await move('waste', 10);
    expect(mine()).toHaveLength(2);
    // Dimatikan owner: tingkat tetap diikuti, tetapi tidak ada pesan.
    await request(app).put('/api/notify/toggles').set(asOwner()).send({ lowStock: false }).expect(200);
    await move('waste', 150);
    expect(mine()).toHaveLength(2);
    await request(app).put('/api/notify/toggles').set(asOwner()).send({ lowStock: true }).expect(200);
    await move('purchase', 100);
    await move('waste', 100);
    expect(mine()).toHaveLength(3);
  });

  it('pengiriman gagal tidak mengganggu kasir; pesan tetap antre dan terkirim pada kejadian berikutnya', async () => {
    fail = true;
    const before = sent.length;
    await soldOut(2, true);
    expect(sent).toHaveLength(before);
    const stuck = await pool.query("select attempts, last_error from notify_outbox where sent_at is null and kind = 'sold-out'");
    expect(stuck.rows).toEqual([{ attempts: 1, last_error: 'APIKey is invalid.' }]);
    const log = (await request(app).get('/api/notify').set(asOwner())).body.log;
    expect(log[0]).toMatchObject({ kind: 'sold-out', sentAt: null, lastError: 'APIKey is invalid.', recipientName: 'Owner' });
    fail = false;
    await soldOut(3, true);
    expect(sent.slice(before).map((m) => m.text.split('\n')[1]).sort()).toEqual([catalog.products[2].name, catalog.products[3].name].sort());
    expect((await pool.query('select 1 from notify_outbox where sent_at is null')).rowCount).toBe(0);
    await soldOut(2, false);
  });

  it('tutup toko: satu ringkasan bahan kurang & menu habis; kiriman ulang tidak mengulang pesan', async () => {
    const day: BusinessDay = { id: randomUUID(), deviceId: 'client', businessDate: '2026-10-06', openedAt: '2026-10-06T00:00:00.000Z', openedById: userId('kasir'), openedByName: 'Kasir 1', closedAt: null, closedById: null, closedByName: '', closingNote: '', shiftIds: [], summary: null };
    const base: Shift = { id: randomUUID(), deviceId: 'client', businessDayId: day.id, openedAt: day.openedAt, openedById: userId('kasir'), openedByName: 'Kasir 1', openingCash: 100000, cashMovements: [], closedAt: null, closedById: null, closedByName: '', countedCash: null, closingNote: '', summary: null };
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(day).expect(200);
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(base).expect(200);
    const shift = { ...base, closedAt: '2026-10-06T15:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 100000, summary: computeShiftSummary(base, []), closeMode: 'day' as const };
    await request(app).put(`/api/shifts/${base.id}`).set(asDevice('kasir')).send(shift).expect(200);
    await drainNotifications();
    expect(texts('*Toko ditutup')).toHaveLength(0);
    const closed = { ...day, closedAt: '2026-10-06T16:00:00.000Z', closedById: userId('kasir'), closedByName: 'Kasir 1', shiftIds: [shift.id], summary: computeBusinessDaySummary([shift]) };
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closed).expect(200);
    await request(app).put(`/api/business-days/${day.id}`).set(asDevice('kasir')).send(closed).expect(200);
    await drainNotifications();
    const [summary, ...rest] = texts('*Toko ditutup');
    expect(rest).toHaveLength(0);
    expect(summary).toContain('Selasa, 6 Okt 2026, ditutup Kasir 1 (Tablet Kasir)');
    expect(summary).toMatch(/Di bawah minimum \(\d+\):\n(- .*\n)*- Sirup Tes Notif: sisa 40 ml, minimum 50/);
    expect(summary).toContain(`- ${catalog.products[3].name}`);

    // Penerima dinonaktifkan: tidak ada pesan baru.
    await request(app).patch(`/api/notify/recipients/${recipientId}`).set(asOwner()).send({ active: false }).expect(200);
    const count = sent.length;
    await soldOut(2, true);
    expect(sent).toHaveLength(count);
    await request(app).delete(`/api/notify/recipients/${recipientId}`).set(asOwner()).expect(200);
    expect((await pool.query('select 1 from notify_outbox')).rowCount).toBe(0);
  });
});

describe('hapus data master (riwayat tetap utuh)', () => {
  const ownerGet = async (url: string) => (await request(app).get(url).set(asOwner()).expect(200)).body;

  it('kategori: ditolak selama masih berisi menu, bisa setelah kosong; hanya owner', async () => {
    const cat = (await request(app).post('/api/categories').set(asOwner()).send({ name: 'Kategori Sementara' }).expect(201)).body;
    const prod = (await request(app).post('/api/products').set(asOwner()).send({ categoryId: cat.id, name: 'Isi Kategori', price: 10000, optionGroupIds: [] }).expect(201)).body;
    await request(app).delete(`/api/categories/${cat.id}`).set(asDevice('kasir')).expect(403);
    const blocked = await request(app).delete(`/api/categories/${cat.id}`).set(asOwner()).expect(400);
    expect(blocked.body.error).toContain('Masih ada 1 menu');
    await request(app).delete(`/api/products/${prod.id}`).set(asOwner()).expect(200);
    await request(app).delete(`/api/categories/${cat.id}`).set(asOwner()).expect(200);
    expect((await ownerGet('/api/admin/catalog')).categories.some((c: { id: string }) => c.id === cat.id)).toBe(false);
    await request(app).patch(`/api/categories/${cat.id}`).set(asOwner()).send({ name: 'Hidup lagi' }).expect(404);
    await request(app).delete(`/api/categories/${cat.id}`).set(asOwner()).expect(404);
  });

  it('varian & add-on: grup hilang dan dilepas dari menu yang memakainya', async () => {
    const group = (await request(app).post('/api/option-groups').set(asOwner()).send({ name: 'Topping Lama', multi: true, required: false, options: [{ name: 'Boba', priceDelta: 5000 }] }).expect(201)).body;
    const prod = (await request(app).post('/api/products').set(asOwner()).send({ categoryId: catalog.categories[0].id, name: 'Menu Bertopping', price: 20000, optionGroupIds: [group.id] }).expect(201)).body;
    await request(app).delete(`/api/option-groups/${group.id}`).set(asOwner()).expect(200);
    const after = await ownerGet('/api/admin/catalog');
    expect(after.optionGroups.some((g: { id: string }) => g.id === group.id)).toBe(false);
    expect(after.products.find((p: { id: string }) => p.id === prod.id).optionGroupIds).toEqual([]);
    await request(app).delete(`/api/option-groups/${group.id}`).set(asOwner()).expect(404);
    await request(app).delete(`/api/products/${prod.id}`).set(asOwner()).expect(200);
  });

  it('bahan: ditolak selama masih dipakai resep; setelah dihapus hilang dari stok tetapi pergerakannya tersimpan', async () => {
    const ing = (await request(app).post('/api/ingredients').set(asOwner()).send({ name: 'Sirup Musiman', unit: 'ml', station: 'bar', minStock: 0, costPerUnit: 50, initialStock: 300 }).expect(201)).body;
    const prod = (await request(app).post('/api/products').set(asOwner()).send({ categoryId: catalog.categories[0].id, name: 'Minuman Musiman', price: 25000, optionGroupIds: [] }).expect(201)).body;
    await request(app).put(`/api/recipes/${prod.id}`).set(asOwner()).send({ lines: [{ optionId: null, ingredientId: ing.id, qty: 30 }] }).expect(200);
    expect(await ownerGet(`/api/ingredients/${ing.id}/usage`)).toEqual({ recipes: ['Minuman Musiman'], stock: 300 });
    const blocked = await request(app).delete(`/api/ingredients/${ing.id}`).set(asOwner()).expect(400);
    expect(blocked.body.error).toContain('Minuman Musiman');
    await request(app).put(`/api/recipes/${prod.id}`).set(asOwner()).send({ lines: [] }).expect(200);
    await request(app).delete(`/api/ingredients/${ing.id}`).set(asDevice('kasir')).expect(403);
    await request(app).delete(`/api/ingredients/${ing.id}`).set(asOwner()).expect(200);
    for (const url of ['/api/ingredients', '/api/ingredients?all=1', '/api/ingredients?inactive=1']) expect((await ownerGet(url)).some((i: { id: string }) => i.id === ing.id)).toBe(false);
    await request(app).post('/api/stock/movements').set(asOwner()).send({ ingredientId: ing.id, type: 'purchase', qty: 10 }).expect(404);
    await request(app).patch(`/api/ingredients/${ing.id}`).set(asOwner()).send({ active: true }).expect(404);
    expect((await pool.query('select 1 from stock_movements where ingredient_id = $1', [ing.id])).rowCount).toBe(1);
    await request(app).delete(`/api/products/${prod.id}`).set(asOwner()).expect(200);
  });

  it('bahan nonaktif tetap terlihat owner (untuk diaktifkan lagi atau dihapus), tidak untuk barista', async () => {
    const ing = (await request(app).post('/api/ingredients').set(asOwner()).send({ name: 'Bahan Libur', unit: 'pcs', station: 'bar', minStock: 0, costPerUnit: 1, active: false }).expect(201)).body;
    const has = (list: { id: string }[]) => list.some((i) => i.id === ing.id);
    expect(has(await ownerGet('/api/ingredients'))).toBe(false);
    expect(has(await ownerGet('/api/ingredients?inactive=1'))).toBe(true);
    const barista = (await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' })).body.token;
    expect(has((await request(app).get('/api/ingredients?inactive=1').set({ Authorization: `Bearer ${barista}` }).expect(200)).body)).toBe(false);
    await request(app).delete(`/api/ingredients/${ing.id}`).set(asOwner()).expect(200);
  });

  it('pengguna: tidak bisa menghapus diri sendiri; yang dihapus tidak bisa login dan username-nya bebas dipakai lagi', async () => {
    await request(app).delete(`/api/users/${userId('owner')}`).set(asOwner()).expect(400);
    const made = (await request(app).post('/api/users').set(asOwner()).send({ name: 'Kitchen Lama', username: 'kitchenlama', role: 'kitchen', pin: '2468' }).expect(201)).body;
    await request(app).post('/api/auth/login').send({ username: 'kitchenlama', pin: '2468' }).expect(200);
    await request(app).delete(`/api/users/${made.id}`).set(asDevice('kasir')).expect(403);
    await request(app).delete(`/api/users/${made.id}`).set(asOwner()).expect(200);
    expect((await ownerGet('/api/users')).some((u: { id: string }) => u.id === made.id)).toBe(false);
    expect((await request(app).get('/api/sync/bootstrap').set(asDevice())).body.users.some((u: { id: string }) => u.id === made.id)).toBe(false);
    expect((await request(app).post('/api/auth/login').send({ username: 'kitchenlama', pin: '2468' })).status).not.toBe(200);
    await request(app).patch(`/api/users/${made.id}`).set(asOwner()).send({ active: true }).expect(404);
    await request(app).delete(`/api/users/${made.id}`).set(asOwner()).expect(404);
    const again = (await request(app).post('/api/users').set(asOwner()).send({ name: 'Kitchen Baru', username: 'kitchenlama', role: 'kitchen', pin: '1357' }).expect(201)).body;
    await request(app).delete(`/api/users/${again.id}`).set(asOwner()).expect(200);
  });

  it('perangkat: hanya yang sudah dicabut bisa dibuang dari daftar; kode struknya tidak dipakai ulang', async () => {
    const paired = (await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Tablet Bekas' }).expect(201)).body;
    await request(app).delete(`/api/devices/${paired.device.id}`).set(asOwner()).expect(400);
    await request(app).post(`/api/devices/${paired.device.id}/revoke`).set(asOwner()).expect(200);
    await request(app).delete(`/api/devices/${paired.device.id}`).set(asOwner()).expect(200);
    expect((await ownerGet('/api/devices')).some((d: { id: string }) => d.id === paired.device.id)).toBe(false);
    await request(app).delete(`/api/devices/${paired.device.id}`).set(asOwner()).expect(404);
    const next = (await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Tablet Pengganti' }).expect(201)).body;
    expect(next.device.code).not.toBe(paired.device.code);
    await request(app).post(`/api/devices/${next.device.id}/revoke`).set(asOwner()).expect(200);
  });
});

describe('persetujuan owner jarak jauh', () => {
  const ask = async (reason = 'Komplimen di atas jatah untuk Barista: Americano') => {
    const id = randomUUID();
    await request(app).post('/api/tablet/approvals').set(asDevice('kasir')).send({ id, reason }).expect(201);
    return id;
  };
  const status = async (id: string) => (await request(app).get(`/api/tablet/approvals/${id}`).set(asDevice('kasir')).expect(200)).body;
  const pending = async () => (await request(app).get('/api/approvals/pending').set(asOwner()).expect(200)).body as { id: string; code: string; reason: string; requestedByName: string }[];

  it('owner menyetujui dari dashboard: tablet menerima nama owner; hanya owner yang bisa memutuskan', async () => {
    const id = await ask();
    expect(await status(id)).toEqual({ status: 'pending', approver: null });
    const mine = (await pending()).find((p) => p.id === id)!;
    expect(mine).toMatchObject({ reason: 'Komplimen di atas jatah untuk Barista: Americano', requestedByName: 'Kasir 1' });
    expect(mine.code).toMatch(/^\d{6}$/);
    await request(app).get('/api/approvals/pending').set(asDevice('kasir')).expect(403);
    await request(app).post(`/api/approvals/${id}/decide`).set(asDevice('kasir')).send({ approve: true }).expect(403);
    await request(app).post(`/api/approvals/${id}/decide`).set(asOwner()).send({ approve: true }).expect(200);
    const done = await status(id);
    expect(done.status).toBe('approved');
    expect(done.approver).toMatchObject({ id: userId('owner'), role: 'owner' });
    // Tidak bisa diputuskan dua kali, dan tidak lagi tampil sebagai menunggu.
    await request(app).post(`/api/approvals/${id}/decide`).set(asOwner()).send({ approve: false }).expect(400);
    expect((await pending()).some((p) => p.id === id)).toBe(false);
  });

  it('ditolak owner, atau kedaluwarsa: tablet tidak mendapat persetujuan', async () => {
    const rejected = await ask('Void transaksi A-1');
    await request(app).post(`/api/approvals/${rejected}/decide`).set(asOwner()).send({ approve: false }).expect(200);
    expect(await status(rejected)).toEqual({ status: 'rejected', approver: null });
    const late = await ask('Diskon 50%');
    await pool.query("update approval_requests set expires_at = now() - interval '1 second' where id = $1", [late]);
    expect(await status(late)).toEqual({ status: 'expired', approver: null });
    await request(app).post(`/api/approvals/${late}/decide`).set(asOwner()).send({ approve: true }).expect(400);
    const code = (await pool.query('select code from approval_requests where id = $1', [late])).rows[0].code;
    expect((await request(app).post(`/api/tablet/approvals/${late}/redeem`).set(asDevice('kasir')).send({ code }).expect(200)).body.status).toBe('expired');
  });

  it('kode sekali pakai: kode benar menyetujui; salah berulang membatalkan permintaan; tablet lain tidak bisa memakainya', async () => {
    const id = await ask();
    const code = (await pending()).find((p) => p.id === id)!.code;
    const wrong = code === '000000' ? '111111' : '000000';
    const miss = await request(app).post(`/api/tablet/approvals/${id}/redeem`).set(asDevice('kasir')).send({ code: wrong }).expect(400);
    expect(miss.body.error).toContain('Sisa 4 kali');
    const other = await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Tablet lain' }).expect(201);
    await request(app).post(`/api/tablet/approvals/${id}/redeem`).set({ Authorization: `Device ${other.body.token}`, 'X-Operator': userId('kasir') }).send({ code }).expect(404);
    await request(app).post(`/api/devices/${other.body.device.id}/revoke`).set(asOwner()).expect(200);
    const ok = await request(app).post(`/api/tablet/approvals/${id}/redeem`).set(asDevice('kasir')).send({ code }).expect(200);
    expect(ok.body).toMatchObject({ status: 'approved', approver: { role: 'owner' } });

    const locked = await ask();
    const real = (await pending()).find((p) => p.id === locked)!.code;
    const bad = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await request(app).post(`/api/tablet/approvals/${locked}/redeem`).set(asDevice('kasir')).send({ code: bad }).expect(400);
    expect((await request(app).post(`/api/tablet/approvals/${locked}/redeem`).set(asDevice('kasir')).send({ code: real }).expect(200)).body.status).toBe('rejected');
  });

  it('permintaan beruntun dibatasi per tablet', async () => {
    await pool.query('delete from approval_requests');
    for (let i = 0; i < 6; i++) await ask(`Permintaan ${i}`);
    const res = await request(app).post('/api/tablet/approvals').set(asDevice('kasir')).send({ id: randomUUID(), reason: 'Satu lagi' }).expect(400);
    expect(res.body.error).toContain('Terlalu banyak');
  });
});

describe('absensi karyawan', () => {
  const PHOTO = `data:image/jpeg;base64,${Buffer.from('selfie').toString('base64')}`;
  const sent: string[] = [];
  const clock = (username: string, clockedAt: string, id = randomUUID()) =>
    request(app).put(`/api/tablet/attendance/${id}`).set(asDevice(username)).send({ userId: userId(username), clockedAt, photo: PHOTO });
  // Tanggal tetap di masa lalu supaya jam "sekarang" tidak memengaruhi hitungan telat. 01:50 UTC = 08:50 WIB.
  const DAY = '2026-09-01';

  beforeAll(() => {
    setTransport(async (_to, text) => {
      sent.push(text);
      return { ok: true, detail: '' };
    });
  });
  afterAll(async () => {
    await drainNotifications();
    setTransport(null);
    await request(app).put('/api/settings').set(asOwner()).send({ attendance: { enabled: false } });
    await pool.query('delete from notify_recipients');
  });

  it('ditolak selama belum diaktifkan; pengaturan jam masuk hanya oleh owner dan ikut ke tablet', async () => {
    expect((await clock('kasir', `${DAY}T01:50:00.000Z`)).status).toBe(400);
    await request(app).put('/api/settings').set(asOwner()).send({ attendance: { startTime: '25:00' } }).expect(400);
    await request(app).put('/api/settings').set(asDevice('kasir')).send({ attendance: { enabled: true } }).expect(403);
    await request(app).put('/api/settings').set(asOwner()).send({ attendance: { enabled: true, startTime: '09:00', graceMinutes: 5 } }).expect(200);
    const boot = (await request(app).get('/api/sync/bootstrap').set(asDevice())).body;
    expect(boot.settings.attendance).toEqual({ enabled: true, startTime: '09:00', graceMinutes: 5, storeLat: null, storeLng: null, radiusM: 150, countFrom: null });
  });

  it('absen dengan PIN sendiri + selfie: tepat waktu / telat dihitung di zona waktu toko, sekali per orang per hari', async () => {
    await request(app).post('/api/notify/recipients').set(asOwner()).send({ name: 'Owner', phone: '081234567890', apikey: 'KUNCIABSEN' }).expect(201);
    const onTime = await clock('kasir', `${DAY}T01:50:00.000Z`);
    expect(onTime.status).toBe(201);
    expect(onTime.body).toMatchObject({ status: 'created', lateMinutes: 0 });
    // 02:20 UTC = 09:20 WIB, toleransi 5 menit -> telat 15 menit.
    const late = await clock('barista', `${DAY}T02:20:00.000Z`);
    expect(late.body).toMatchObject({ status: 'created', lateMinutes: 15 });
    await drainNotifications();
    expect(sent.filter((t) => t.startsWith('*Absen telat'))).toEqual([expect.stringContaining('Barista absen 09:20, telat 15 menit dari jam masuk 09:00.')]);
    // Absen kedua di hari yang sama tidak menimpa yang pertama.
    expect((await clock('kasir', `${DAY}T03:00:00.000Z`)).body.status).toBe('exists');
    expect((await pool.query("select to_char(clocked_at at time zone 'Asia/Jakarta', 'HH24:MI') as t from attendance where user_id = $1 and business_date = $2", [userId('kasir'), DAY])).rows[0].t).toBe('08:50');
    // Tidak bisa mengabsenkan orang lain, dan foto wajib JPEG.
    await request(app).put(`/api/tablet/attendance/${randomUUID()}`).set(asDevice('kasir')).send({ userId: userId('barista'), clockedAt: `${DAY}T01:00:00.000Z`, photo: PHOTO }).expect(403);
    await request(app).put(`/api/tablet/attendance/${randomUUID()}`).set(asDevice('kitchen')).send({ userId: userId('kitchen'), clockedAt: `${DAY}T01:00:00.000Z`, photo: 'data:text/html;base64,AAAA' }).expect(400);
  });

  it('owner melihat daftar hadir, yang belum absen, dan fotonya; kasir tidak', async () => {
    const res = await request(app).get(`/api/attendance?from=${DAY}&to=${DAY}`).set(asOwner()).expect(200);
    expect(res.body.rows.map((r: { userName: string; lateMinutes: number; hasPhoto: boolean }) => [r.userName, r.lateMinutes, r.hasPhoto])).toEqual([['Kasir 1', 0, true], ['Barista', 15, true]]);
    expect(res.body.staff.some((u: { role: string }) => u.role === 'owner')).toBe(false);
    const photo = await request(app).get(`/api/attendance/${res.body.rows[0].id}/photo`).set(asOwner()).expect(200);
    expect(photo.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.from(photo.body).toString()).toBe('selfie');
    await request(app).get(`/api/attendance?from=${DAY}&to=${DAY}`).set(asDevice('kasir')).expect(403);
    await request(app).get(`/api/attendance/${res.body.rows[0].id}/photo`).set(asDevice('kasir')).expect(403);
  });

  it('absen dari HP barista: jam server, wajib di dalam radius toko bila titik toko diisi, sekali per hari; owner tidak absen', async () => {
    const barista = (await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' })).body.token;
    const asBarista = { Authorization: `Bearer ${barista}` };
    const before = (await request(app).get('/api/me/attendance').set(asBarista).expect(200)).body;
    expect(before).toMatchObject({ enabled: true, required: true, startTime: '09:00', location: { set: false, radiusM: 150 }, today: null });
    // Titik toko diisi owner -> lokasi wajib & diperiksa.
    await request(app).put('/api/settings').set(asOwner()).send({ attendance: { storeLat: -6.2, storeLng: 106.816666, radiusM: 150 } }).expect(200);
    const noLoc = await request(app).put(`/api/me/attendance/${randomUUID()}`).set(asBarista).send({ photo: PHOTO, location: null }).expect(400);
    expect(noLoc.body.error).toContain('Izinkan akses lokasi');
    const far = await request(app).put(`/api/me/attendance/${randomUUID()}`).set(asBarista).send({ photo: PHOTO, location: { lat: -6.209, lng: 106.816666, accuracy: 20 } }).expect(400);
    expect(far.body.error).toContain('1 km dari toko');
    const ok = await request(app).put(`/api/me/attendance/${randomUUID()}`).set(asBarista).send({ photo: PHOTO, location: { lat: -6.2005, lng: 106.816666, accuracy: 15 } }).expect(201);
    expect(ok.body.status).toBe('created');
    expect(Math.abs(new Date(ok.body.clockedAt).getTime() - Date.now())).toBeLessThan(10_000);
    const again = await request(app).put(`/api/me/attendance/${randomUUID()}`).set(asBarista).send({ photo: PHOTO, location: { lat: -6.2005, lng: 106.816666, accuracy: 15 } }).expect(200);
    expect(again.body).toMatchObject({ status: 'exists', clockedAt: ok.body.clockedAt });
    const after = (await request(app).get('/api/me/attendance').set(asBarista).expect(200)).body;
    expect(after.today).toMatchObject({ source: 'hp', distanceM: 56 });
    expect(after.history[0].date).toBe(after.today.date);
    const owner = await request(app).put(`/api/me/attendance/${randomUUID()}`).set(asOwner()).send({ photo: PHOTO, location: null }).expect(400);
    expect(owner.body.error).toContain('Owner tidak perlu absen');
    expect((await request(app).get('/api/me/attendance').set(asOwner()).expect(200)).body.required).toBe(false);
    const list = (await request(app).get(`/api/attendance?from=${after.today.date}&to=${after.today.date}`).set(asOwner()).expect(200)).body.rows;
    expect(list.find((r: { userName: string }) => r.userName === 'Barista')).toMatchObject({ source: 'hp', distanceM: 56 });
    await request(app).put('/api/settings').set(asOwner()).send({ attendance: { storeLat: null, storeLng: null } }).expect(200);
  });

  it('ringkasan harian dikirim sekali setelah jam masuk lewat, dipicu sinkron tablet', async () => {
    // Jam masuk 00:00 supaya "sekarang" pasti sudah lewat, kapan pun tes dijalankan.
    await request(app).put('/api/settings').set(asOwner()).send({ attendance: { startTime: '00:00', graceMinutes: 0 } }).expect(200);
    await pool.query("delete from settings where key = 'attendance_summary'");
    const before = sent.length;
    await request(app).get('/api/sync/bootstrap').set(asDevice()).expect(200);
    await request(app).get('/api/sync/bootstrap').set(asDevice()).expect(200);
    await drainNotifications();
    const summaries = sent.slice(before).filter((t) => t.startsWith('*Absensi'));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain('jam masuk 00:00');
    expect(summaries[0]).toMatch(/Belum absen \(\d+\):\n(- .*\n)*- Kasir 1/);
    expect(summaries[0]).not.toContain('Owner');
  });
});

describe('keamanan login & sesi', () => {
  const login = (body: Record<string, string>, ip = '10.0.0.1') => request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send(body);

  it('tablet tidak bisa memakai fungsi owner hanya dengan menyebut ID owner; butuh token operator dari PIN yang dicek server', async () => {
    const asOwnerOnTablet = { ...asDevice('owner') };
    await request(app).get('/api/users').set(asOwnerOnTablet).expect(403);
    await request(app).put('/api/settings').set(asOwnerOnTablet).send({ store: { name: 'Dibajak' } }).expect(403);
    await request(app).post('/api/tablet/operator-token').set(asOwnerOnTablet).send({ pin: '000000' }).expect(401);
    const { token } = (await request(app).post('/api/tablet/operator-token').set(asOwnerOnTablet).send({ pin: '123456' }).expect(200)).body;
    await request(app).get('/api/users').set({ ...asOwnerOnTablet, 'X-Operator-Token': token }).expect(200);
    // Token terikat ke operator & tablet: tidak berlaku untuk kasir, tablet lain, atau sebagai sesi Bearer.
    await request(app).get('/api/users').set({ ...asDevice('kasir'), 'X-Operator-Token': token }).expect(403);
    await request(app).get('/api/users').set({ Authorization: `Bearer ${token}` }).expect(401);
    const other = await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Tablet lain 2' }).expect(201);
    await request(app).get('/api/users').set({ Authorization: `Device ${other.body.token}`, 'X-Operator': userId('owner'), 'X-Operator-Token': token }).expect(403);
    await request(app).post(`/api/devices/${other.body.device.id}/revoke`).set(asOwner()).expect(200);
    // Jualan biasa di tablet tetap jalan tanpa token operator.
    await request(app).get('/api/sync/bootstrap').set(asDevice('kasir')).expect(200);
  });

  it('PIN diatur ulang owner: sesi HP lama orang itu berakhir', async () => {
    const barista = (await login({ username: 'barista', pin: '1111' })).body.token;
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${barista}` }).expect(200);
    await request(app).patch(`/api/users/${userId('barista')}`).set(asOwner()).send({ pin: '1111' }).expect(200);
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${barista}` }).expect(401);
  });

  it('owner membuat kata sandi: login online & aktivasi tablet wajib kata sandi, sesi lama berakhir, PIN tetap untuk tablet', async () => {
    const first = (await login({ username: 'owner', pin: '123456' }).expect(200)).body;
    expect(first.mustSetPassword).toBe(true);
    expect((await request(app).get('/api/auth/method?username=owner').expect(200)).body.method).toBe('pin');
    const H = { Authorization: `Bearer ${first.token}` };
    await request(app).post('/api/auth/password').set(H).send({ password: 'pendek1' }).expect(400);
    await request(app).post('/api/auth/password').set(asDevice('owner')).send({ password: 'Kopi-susu-77' }).expect(403);
    const set = (await request(app).post('/api/auth/password').set(H).send({ password: 'Kopi-susu-77' }).expect(200)).body;
    await request(app).get('/api/auth/me').set(H).expect(401);
    await request(app).get('/api/auth/me').set(asOwner()).expect(401);
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${set.token}` }).expect(200);
    expect((await request(app).get('/api/auth/method?username=owner').expect(200)).body.method).toBe('password');
    expect((await login({ username: 'owner', pin: '123456' }).expect(401)).body.error).toBe('Akun owner masuk dengan kata sandi');
    const viaPassword = (await login({ username: 'owner', password: 'Kopi-susu-77' }).expect(200)).body;
    expect(viaPassword.mustSetPassword).toBe(false);
    await request(app).post('/api/devices/pair').send({ username: 'owner', pin: '123456', name: 'Tablet PIN' }).expect(401);
    const paired = await request(app).post('/api/devices/pair').send({ username: 'owner', password: 'Kopi-susu-77', name: 'Tablet sandi' }).expect(201);
    await request(app).post(`/api/devices/${paired.body.device.id}/revoke`).set({ Authorization: `Bearer ${viaPassword.token}` }).expect(200);
    // Ganti kata sandi butuh yang lama.
    await request(app).post('/api/auth/password').set({ Authorization: `Bearer ${viaPassword.token}` }).send({ current: 'salah', password: 'Teh-tarik-88' }).expect(400);
    // Keluar dari semua perangkat.
    const other = (await login({ username: 'owner', password: 'Kopi-susu-77' }).expect(200)).body.token;
    const fresh = (await request(app).post('/api/auth/logout-all').set({ Authorization: `Bearer ${viaPassword.token}` }).expect(200)).body.token;
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${other}` }).expect(401);
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${fresh}` }).expect(200);
  });

  it('lupa kata sandi: diatur ulang dari tablet aktif setelah PIN owner dibuktikan ke server', async () => {
    await request(app).post('/api/tablet/owner/password').set(asDevice('owner')).send({ password: 'Teh-tarik-88' }).expect(403);
    const { token } = (await request(app).post('/api/tablet/operator-token').set(asDevice('owner')).send({ pin: '123456' }).expect(200)).body;
    await request(app).post('/api/tablet/owner/password').set({ ...asDevice('owner'), 'X-Operator-Token': token }).send({ password: 'Teh-tarik-88' }).expect(200);
    await login({ username: 'owner', password: 'Kopi-susu-77' }).expect(401);
    await login({ username: 'owner', password: 'Teh-tarik-88' }).expect(200);
    // Token operator lama ikut berakhir karena versi sesi naik.
    await request(app).get('/api/users').set({ ...asDevice('owner'), 'X-Operator-Token': token }).expect(403);
  });

  it('percobaan PIN dari banyak IP tetap mengunci akun', async () => {
    // Mulai dari hitungan bersih (tes lebih awal sudah mencoba PIN salah untuk akun ini).
    await pool.query("delete from login_attempts where key like '%kitchen%'");
    for (let i = 0; i < 10; i++) await login({ username: 'kitchen', pin: '0000' }, `10.1.0.${i + 1}`).expect(401);
    const locked = await login({ username: 'kitchen', pin: '2222' }, '10.9.9.9');
    expect(locked.status).toBe(429);
    expect(locked.body.error).toContain('Terlalu banyak percobaan');
  });
});

describe('kosongkan data penjualan uji', () => {
  let owner = '';
  const asReal = () => ({ Authorization: `Bearer ${owner}` });

  it('hanya owner online dengan kata sandi; penjualan & buka/tutup toko hilang, pengaturan & master tetap; tablet lama ditolak sampai menyegarkan', async () => {
    owner = (await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token;
    const before = (await request(app).get('/api/admin/reset-sales').set(asReal()).expect(200)).body;
    expect(before.counts.orders).toBeGreaterThan(0);
    expect(before.counts.shifts).toBeGreaterThan(0);
    const settingsBefore = (await request(app).get('/api/settings').set(asReal())).body;
    const productsBefore = (await request(app).get('/api/admin/catalog').set(asReal())).body.products.length;
    const otherMoves = (await pool.query("select count(*)::int as n from stock_movements where ref_type is distinct from 'order'")).rows[0].n;

    await request(app).post('/api/admin/reset-sales').set(asDevice('kasir')).send({ secret: '1234', confirm: 'KOSONGKAN' }).expect(403);
    await request(app).post('/api/admin/reset-sales').set(asDevice('owner')).send({ secret: '123456', confirm: 'KOSONGKAN' }).expect(403);
    await request(app).post('/api/admin/reset-sales').set(asReal()).send({ secret: 'salah-123', confirm: 'KOSONGKAN' }).expect(401);
    await request(app).post('/api/admin/reset-sales').set(asReal()).send({ secret: 'Teh-tarik-88', confirm: 'hapus' }).expect(400);

    const backup = (await request(app).get('/api/admin/backup/sales').set(asReal()).expect(200)).body;
    expect(backup.tables.orders.length).toBe(before.counts.orders);
    expect(backup.tables.shift_proofs.every((p: Record<string, unknown>) => !('image' in p))).toBe(true);

    const res = (await request(app).post('/api/admin/reset-sales').set(asReal()).send({ secret: 'Teh-tarik-88', confirm: 'KOSONGKAN' }).expect(200)).body;
    expect(res.removed.orders).toBe(before.counts.orders);
    const after = (await request(app).get('/api/admin/reset-sales').set(asReal()).expect(200)).body;
    expect(after.counts).toEqual({ orders: 0, voids: 0, total: 0, shifts: 0, days: 0, stockMovements: 0 });
    expect(after.lastReset.id).toBe(res.epoch.id);
    expect((await pool.query("select count(*)::int as n from stock_movements where ref_type is distinct from 'order'")).rows[0].n).toBe(otherMoves);
    expect((await request(app).get('/api/settings').set(asReal())).body).toEqual(settingsBefore);
    expect((await request(app).get('/api/admin/catalog').set(asReal())).body.products.length).toBe(productsBefore);

    // Tablet dengan data dari sebelum reset: kiriman ditolak (tidak dihitung gagal permanen), bootstrap tetap jalan.
    const order = makeOrder('Americano', [], 1, { shiftId: randomUUID() });
    const stale = await request(app).put(`/api/orders/${order.id}`).set(asDevice('kasir')).send(order).expect(409);
    expect(stale.body.error).toContain('sebelum data penjualan dikosongkan');
    const boot = (await request(app).get('/api/sync/bootstrap').set(asDevice()).expect(200)).body;
    expect(boot.dataEpoch).toBe(res.epoch.id);
    expect((await request(app).get('/api/data-epoch').set(asReal()).expect(200)).body.id).toBe(res.epoch.id);
    await request(app).put(`/api/orders/${order.id}`).set({ ...asDevice('kasir'), 'X-Data-Epoch': res.epoch.id }).send(order).expect(201);
    const log = await pool.query("select data from audit_log where action = 'reset-sales'");
    expect(log.rows[0].data.orders).toBe(before.counts.orders);
  });
});

describe('owner menghapus data uji per bagian', () => {
  let H: Record<string, string> = {};
  let epoch = '';
  // Setelah data penjualan dikosongkan, kiriman tablet harus membawa versi data terbaru.
  const kasir = () => ({ ...asDevice('kasir'), 'X-Data-Epoch': epoch });
  beforeAll(async () => {
    H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    epoch = (await request(app).get('/api/data-epoch').set(H)).body.id;
  });

  it('absen: hapus satu (orang itu bisa absen lagi) atau semua absen satu hari; tablet melihat daftar terbaru; hanya owner', async () => {
    const DAY = '2026-09-01';
    const rows = (await request(app).get(`/api/attendance?from=${DAY}&to=${DAY}`).set(H).expect(200)).body.rows as { id: string; userName: string }[];
    expect(rows.length).toBeGreaterThan(1);
    await request(app).delete(`/api/attendance/${rows[0].id}`).set(kasir()).expect(403);
    await request(app).delete(`/api/attendance/${rows[0].id}`).set(H).expect(200);
    expect((await request(app).get(`/api/attendance?from=${DAY}&to=${DAY}`).set(H)).body.rows.length).toBe(rows.length - 1);
    const cleared = (await request(app).post('/api/attendance/clear-day').set(H).send({ date: DAY }).expect(200)).body;
    expect(cleared.removed).toBe(rows.length - 1);
    const today = (await request(app).get('/api/tablet/attendance/today').set(asDevice('kasir')).expect(200)).body;
    expect(Array.isArray(today.userIds)).toBe(true);
    // Absen hari ini dihapus -> barista bisa absen ulang dari HP.
    const mine = (await request(app).get(`/api/attendance?from=${today.date}&to=${today.date}`).set(H)).body.rows.find((r: { userName: string }) => r.userName === 'Barista');
    if (mine) {
      await request(app).delete(`/api/attendance/${mine.id}`).set(H).expect(200);
      expect((await request(app).get('/api/tablet/attendance/today').set(asDevice('kasir'))).body.userIds).not.toContain(userId('barista'));
    }
    expect((await pool.query("select count(*)::int as n from audit_log where entity = 'attendance'")).rows[0].n).toBeGreaterThan(0);
  });

  it('opname: dihapus beserta penyesuaian stoknya; stok kembali seperti sebelum opname', async () => {
    const ops = (await request(app).get('/api/opname?from=2000-01-01&to=2100-01-01').set(H).expect(200)).body as { id: string }[];
    expect(ops.length).toBeGreaterThan(0);
    const target = ops[0].id;
    const moves = (await pool.query<{ ingredient_id: string; qty: number }>("select ingredient_id, qty from stock_movements where ref_type = 'opname' and ref_id = $1", [target])).rows;
    const before = new Map<string, number>();
    for (const m of moves) before.set(m.ingredient_id, (await pool.query("select coalesce(sum(qty),0)::float8 as s from stock_movements where ingredient_id = $1", [m.ingredient_id])).rows[0].s);
    await request(app).delete(`/api/opname/${target}`).set(kasir()).expect(403);
    await request(app).delete(`/api/opname/${target}`).set(H).expect(200);
    for (const m of moves) {
      const now = (await pool.query("select coalesce(sum(qty),0)::float8 as s from stock_movements where ingredient_id = $1", [m.ingredient_id])).rows[0].s;
      expect(now).toBeCloseTo(before.get(m.ingredient_id)! - m.qty, 3);
    }
    await request(app).delete(`/api/opname/${target}`).set(H).expect(404);
  });

  it('barang masuk/terbuang/koreksi bisa dihapus; pemakaian penjualan & hasil opname tidak', async () => {
    const milk = (await request(app).get('/api/ingredients?all=1').set(H)).body.find((i: { name: string }) => i.name === 'Susu Segar');
    await request(app).post('/api/stock/movements').set(H).send({ ingredientId: milk.id, type: 'waste', qty: 7, note: 'uji hapus' }).expect(201);
    const row = (await pool.query("select id from stock_movements where note = 'uji hapus'")).rows[0];
    await request(app).delete(`/api/stock/movements/${row.id}`).set(kasir()).expect(403);
    await request(app).delete(`/api/stock/movements/${row.id}`).set(H).expect(200);
    expect((await pool.query('select 1 from stock_movements where id = $1', [row.id])).rowCount).toBe(0);
    const derived = (await pool.query("select id from stock_movements where ref_type is not null limit 1")).rows[0];
    if (derived) await request(app).delete(`/api/stock/movements/${derived.id}`).set(H).expect(400);
  });
});

describe('jadwal shift, gaji, kasbon, bonus & slip gaji', () => {
  let H: Record<string, string> = {};
  let barista: Record<string, string> = {};
  let tpl: { id: string; name: string; startTime: string; rates: { fee: number; effectiveFrom: string }[] }[] = [];
  beforeAll(async () => {
    H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    barista = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' }).expect(200)).body.token}` };
    tpl = (await request(app).get('/api/schedule?from=2026-11-02&to=2026-11-08').set(H).expect(200)).body.templates;
  });
  const T = (name: string) => tpl.find((t) => t.name === name)!.id;

  it('shift bawaan Mourden: Shift 1 09-16 & Shift 2 15-22 (75 rb), Kitchen 14-21 (70 rb)', () => {
    expect(tpl.map((t) => [t.name, t.startTime, t.rates[0].fee])).toEqual([['Shift 1', '09:00', 75000], ['Shift 2', '15:00', 75000], ['Kitchen', '14:00', 70000]]);
  });

  it('owner mengatur jadwal; karyawan & tablet melihat jadwal tanpa tarif; karyawan tidak bisa mengubah', async () => {
    const put = (date: string, name: string, user: string, status = 'masuk') => request(app).put('/api/schedule/entries').set(H).send({ date, templateId: T(name), userId: userId(user), status, note: status === 'sakit' ? 'demam' : '' }).expect(200);
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']) await put(d, 'Shift 1', 'barista');
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await put(d, 'Kitchen', 'kitchen');
    await put('2026-11-08', 'Shift 2', 'barista', 'sakit');
    await request(app).put('/api/schedule/entries').set(barista).send({ date: '2026-11-08', templateId: T('Shift 1'), userId: userId('barista') }).expect(403);
    const staffView = (await request(app).get('/api/schedule?from=2026-11-02&to=2026-11-08').set(barista).expect(200)).body;
    expect(staffView.templates.every((t: { rates: unknown[] }) => t.rates.length === 0)).toBe(true);
    expect(staffView.entries).toHaveLength(11);
    expect(staffView.me).toBe(userId('barista'));
    const tabletView = await request(app).get('/api/schedule?from=2026-11-02&to=2026-11-08').set({ Authorization: asDevice().Authorization }).expect(200);
    expect(tabletView.body.entries.find((e: { status: string }) => e.status === 'sakit').note).toBe('demam');
    await request(app).get('/api/schedule?from=2026-11-02&to=2026-11-08').expect(401);
    // Salin minggu: status kembali "masuk", yang sudah ada tidak dobel.
    const copied = (await request(app).post('/api/schedule/copy-week').set(H).send({ from: '2026-11-02', to: '2026-11-09' }).expect(200)).body.copied;
    expect(copied).toBe(11);
    expect((await request(app).post('/api/schedule/copy-week').set(H).send({ from: '2026-11-02', to: '2026-11-09' }).expect(200)).body.copied).toBe(0);
  });

  it('gaji November: shift masuk x tarif (tarif baru berlaku per tanggal), kasbon dikurangi, bonus mingguan ditambah', async () => {
    await request(app).post(`/api/shift-templates/${T('Shift 1')}/rates`).set(H).send({ fee: 80000, effectiveFrom: '2026-11-09' }).expect(200);
    const k1 = (await request(app).post('/api/kasbon').set(H).send({ userId: userId('barista'), date: '2026-11-04', amount: 100000, note: 'kasbon 1' }).expect(201)).body.id;
    await request(app).post('/api/kasbon').set(H).send({ userId: userId('barista'), date: '2026-11-20', amount: 50000, note: 'kasbon 2' }).expect(201);
    await request(app).post('/api/kasbon').set(barista).send({ userId: userId('barista'), date: '2026-11-20', amount: 50000 }).expect(403);
    // Minggu 2-8 Nov: omset manual 7,2 jt -> bonus tim 250 rb dibagi 10 shift masuk.
    await request(app).put('/api/bonus-weeks/2026-11-02').set(H).send({ omsetOverride: 7_200_000, disqualified: [], note: 'uji' }).expect(200);
    await request(app).put('/api/bonus-weeks/2026-11-03').set(H).send({ omsetOverride: 1, disqualified: [] }).expect(400);
    const pay = (await request(app).get('/api/payroll?month=2026-11').set(H).expect(200)).body;
    const w = pay.weeks.find((x: { weekStart: string }) => x.weekStart === '2026-11-02');
    expect(w).toMatchObject({ omset: 7_200_000, omsetSource: 'manual', teamBonus: 250_000, totalShifts: 10, perShift: 25_000 });
    const b = pay.people.find((p: { name: string }) => p.name === 'Barista');
    // Minggu 1: 6 Shift 1 @75 rb. Minggu 2 (salinan): 6 Shift 1 @80 rb + Shift 2 tgl 15 (status salinan kembali Masuk) @75 rb.
    expect(b.gross).toBe(6 * 75000 + 6 * 80000 + 75000);
    expect(b.absences).toEqual([{ date: '2026-11-08', templateName: 'Shift 2', status: 'sakit', note: 'demam' }]);
    expect(b.kasbonTotal).toBe(150000);
    expect(b.bonusTotal).toBe(150000);
    expect(b.takeHome).toBe(b.gross - 150000 + 150000);
    const kitchenPay = pay.people.find((p: { name: string }) => p.name === 'Kitchen');
    expect(kitchenPay.gross).toBe(8 * 70000);
    await request(app).delete(`/api/kasbon/${k1}`).set(H).expect(200);
    expect((await request(app).get('/api/payroll?month=2026-11').set(H)).body.people.find((p: { name: string }) => p.name === 'Barista').kasbonTotal).toBe(50000);
    await request(app).get('/api/payroll?month=2026-11').set(barista).expect(403);
  });

  it('slip gaji: dibuat dari perhitungan saat itu, bisa dibuat ulang (tidak dobel) dan dihapus', async () => {
    expect((await request(app).post('/api/payslips').set(H).send({ month: '2026-11' }).expect(201)).body.created).toBe(2);
    await request(app).post('/api/payslips').set(H).send({ month: '2026-11', userIds: [userId('barista')] }).expect(201);
    const list = (await request(app).get('/api/payslips?month=2026-11').set(H).expect(200)).body;
    expect(list.map((s: { name: string }) => s.name).sort()).toEqual(['Barista', 'Kitchen']);
    const slip = (await request(app).get(`/api/payslips/${list[0].id}`).set(H).expect(200)).body;
    expect(slip.data).toMatchObject({ month: '2026-11', storeName: expect.any(String) });
    expect(slip.data.takeHome).toBe(list[0].takeHome);
    await request(app).delete(`/api/payslips/${list[0].id}`).set(barista).expect(403);
    await request(app).delete(`/api/payslips/${list[0].id}`).set(H).expect(200);
    expect((await request(app).get('/api/payslips?month=2026-11').set(H)).body).toHaveLength(1);
    await request(app).post('/api/payslips').set(H).send({ month: '2025-01' }).expect(400);
  });

  it('absen dihitung dari jam shift orang itu hari ini (Shift 2 = 15:00), bukan jam masuk umum', async () => {
    const today = (await request(app).get('/api/schedule?from=2026-11-02&to=2026-11-02').set(H)).body.today;
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: true, startTime: '09:00' } }).expect(200);
    const existing = (await request(app).get(`/api/schedule?from=${today}&to=${today}`).set(H)).body.entries.filter((e: { userId: string }) => e.userId === userId('barista'));
    for (const e of existing) await request(app).delete(`/api/schedule/entries/${e.id}`).set(H).expect(200);
    await request(app).put('/api/schedule/entries').set(H).send({ date: today, templateId: T('Shift 2'), userId: userId('barista') }).expect(200);
    const me = (await request(app).get('/api/me/attendance').set(barista).expect(200)).body;
    expect(me).toMatchObject({ startTime: '15:00', shiftName: 'Shift 2' });
    const boot = (await request(app).get('/api/sync/bootstrap').set(asDevice()).expect(200)).body;
    expect(boot.scheduleToday.entries).toContainEqual({ userId: userId('barista'), startTime: '15:00', templateName: 'Shift 2' });
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: false } }).expect(200);
  });
});

describe('tempel jadwal', () => {
  let H: Record<string, string> = {};
  let tpl: { id: string; name: string }[] = [];
  beforeAll(async () => {
    H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    tpl = (await request(app).get('/api/schedule?from=2026-12-07&to=2026-12-07').set(H)).body.templates;
  });
  const T = (name: string) => tpl.find((t) => t.name === name)!.id;

  it('menerapkan banyak jadwal sekaligus, mengganti tanggal yang sama, jam dari teks diabaikan, alias diingat, owner tidak digaji', async () => {
    await request(app).put('/api/schedule/entries').set(H).send({ date: '2026-12-07', templateId: T('Shift 1'), userId: userId('kasir') }).expect(200);
    const body = {
      entries: [
        { date: '2026-12-07', templateId: T('Shift 1'), userId: userId('barista'), startTime: null, endTime: null },
        { date: '2026-12-07', templateId: T('Kitchen'), userId: userId('kitchen'), startTime: '14:00', endTime: '20:30' },
        { date: '2026-12-08', templateId: T('Shift 1'), userId: userId('owner'), startTime: null, endTime: null },
      ],
      replaceDates: ['2026-12-07', '2026-12-08'],
      aliases: { ntu: userId('barista'), Jon: userId('owner') },
    };
    const epoch = (await request(app).get('/api/data-epoch').set(H)).body.id;
    await request(app).post('/api/schedule/import').set({ ...asDevice('kasir'), 'X-Data-Epoch': epoch }).send(body).expect(403);
    expect((await request(app).post('/api/schedule/import').set(H).send(body).expect(201)).body.created).toBe(3);
    const week = (await request(app).get('/api/schedule?from=2026-12-07&to=2026-12-13').set(H)).body;
    expect(week.entries.map((e: { userName: string; startTime: string | null; endTime: string | null }) => [e.userName, e.startTime, e.endTime])).toEqual([
      ['Barista', null, null],
      // Jam di teks tempelan tidak disimpan: jadwal hasil tempel selalu ikut jam shift.
      ['Kitchen', null, null],
      ['Owner', null, null],
    ]);
    expect(week.aliases).toMatchObject({ ntu: userId('barista'), jon: userId('owner') });
    const pay = (await request(app).get('/api/payroll?month=2026-12').set(H)).body;
    expect(pay.people.map((p: { name: string }) => p.name).sort()).toEqual(['Barista', 'Kitchen']);
    // Salin minggu ikut membawa jam khusus yang diatur owner per orang.
    await request(app).put('/api/schedule/entries').set(H).send({ date: '2026-12-07', templateId: T('Kitchen'), userId: userId('kitchen'), startTime: '14:00', endTime: '20:30' }).expect(200);
    await request(app).post('/api/schedule/copy-week').set(H).send({ from: '2026-12-07', to: '2026-12-14' }).expect(200);
    const next = (await request(app).get('/api/schedule?from=2026-12-14&to=2026-12-14').set(H)).body.entries;
    expect(next.find((e: { userName: string }) => e.userName === 'Kitchen')).toMatchObject({ startTime: '14:00', endTime: '20:30' });
  });
});

describe('lembur', () => {
  let H: Record<string, string> = {};
  let shift1 = '';
  beforeAll(async () => {
    H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    shift1 = (await request(app).get('/api/schedule?from=2027-01-04&to=2027-01-04').set(H)).body.templates.find((t: { name: string }) => t.name === 'Shift 1').id;
  });

  it('jam lembur x tarif per jam (bawaan 10 rb) masuk gaji; tarif dibekukan saat dicatat; karyawan tidak melihatnya', async () => {
    const put = (date: string, extra: Record<string, unknown>) => request(app).put('/api/schedule/entries').set(H).send({ date, templateId: shift1, userId: userId('barista'), ...extra }).expect(200);
    await put('2027-01-04', { overtimeHours: 2, overtimeNote: 'sampai 18:00' });
    await put('2027-01-05', {});
    await request(app).put('/api/schedule/entries').set(H).send({ date: '2027-01-05', templateId: shift1, userId: userId('barista'), overtimeHours: 0.3 }).expect(400);
    await request(app).put('/api/payroll/settings').set(H).send({ overtimeRate: 15000 }).expect(200);
    await put('2027-01-05', { overtimeHours: 1.5 });
    // Mengubah status/catatan tanpa menyentuh lembur tidak menghapus lemburnya, dan tarif lamanya tetap.
    await put('2027-01-04', { note: '' });
    const pay = (await request(app).get('/api/payroll?month=2027-01').set(H).expect(200)).body;
    const b = pay.people.find((p: { name: string }) => p.name === 'Barista');
    expect(b.overtime.map((o: { date: string; hours: number; rate: number; amount: number }) => [o.date, o.hours, o.rate, o.amount])).toEqual([['2027-01-04', 2, 10000, 20000], ['2027-01-05', 1.5, 15000, 22500]]);
    expect(b.overtimeTotal).toBe(42500);
    expect(b.takeHome).toBe(b.gross + 42500 - b.kasbonTotal + b.bonusTotal);
    expect(pay.overtimeRate).toBe(15000);
    const staff = (await request(app).get('/api/schedule?from=2027-01-04&to=2027-01-04').set({ Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' })).body.token}` })).body;
    expect(staff.entries[0].overtimeHours).toBeUndefined();
    await request(app).put('/api/payroll/settings').set(H).send({ overtimeRate: 10000 }).expect(200);
  });
});

describe('impor penjualan ESB', () => {
  let H: Record<string, string> = {};
  const tx = (ref: string, date: string, time: string, method: string, subtotal: number, service = 0, rounding = 0) => ({
    ref, bill: `B-${ref}`, date, paidAt: `${date}T${time}`, orderType: 'dine_in', table: '', method, salesType: 'Sales',
    subtotal, discount: 0, service, tax: 0, otherFees: 0, rounding, total: subtotal + service + rounding,
  });
  const line = (name: string, qty: number, price: number) => ({ name, category: 'Minuman', sub: 'Coffee', qty, bills: qty, amount: qty * price });
  const payload = () => ({
    transactions: [
      tx('E1', '2027-02-01', '12:01:05', 'EDC Mandiri (POS)', 52000, 1300, 200),
      tx('E2', '2027-02-01', '15:30:11', 'Cash (POS)', 26000),
      tx('E3', '2027-02-02', '10:00:00', 'QRIS', 24000),
      { ...tx('E4', '2027-02-02', '11:00:00', 'Cash (POS)', 99000), salesType: 'Void' },
    ],
    menuDays: [{ date: '2027-02-01', lines: [line('Es Kopi Susu ESB', 1, 26000), line('Latte Spesial', 2, 26000)] }],
  });

  beforeAll(async () => {
    H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
  });

  it('pratinjau per hari, impor idempotent, masuk laporan dengan tanda ESB, bisa dihapus; hanya owner', async () => {
    const barista = (await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' })).body.token;
    await request(app).post('/api/admin/import/esb/preview').set({ Authorization: `Bearer ${barista}` }).send(payload()).expect(403);

    const p = (await request(app).post('/api/admin/import/esb/preview').set(H).send(payload()).expect(200)).body;
    expect(p.days.map((d: { date: string; bills: number; exact: boolean; hasMenu: boolean; total: number }) => [d.date, d.bills, d.exact, d.hasMenu, d.total])).toEqual([
      ['2027-02-01', 2, true, true, 79500],
      ['2027-02-02', 1, false, false, 24000],
    ]);
    expect(p.days[1].skipped).toEqual([{ ref: 'E4', bill: 'B-E4', reason: 'Jenis "Void" bukan penjualan' }]);
    expect(p.methods).toEqual(expect.arrayContaining([{ name: 'EDC Mandiri (POS)', method: 'card' }, { name: 'QRIS', method: 'qris' }]));
    // Menu tujuan dengan resep: 150 ml x Rp 40 = HPP Rp 6.000 per gelas.
    const cat = (await request(app).get('/api/admin/catalog').set(H).expect(200)).body.categories[0];
    const product = { id: (await request(app).post('/api/products').set(H).send({ categoryId: cat.id, name: 'Latte Uji HPP', price: 26000 }).expect(201)).body.id, name: 'Latte Uji HPP' };
    const ing = (await request(app).post('/api/ingredients').set(H).send({ name: 'Susu Uji HPP', unit: 'ml', station: 'bar', minStock: 0, costPerUnit: 40, initialStock: 1000 }).expect(201)).body;
    await request(app).put(`/api/recipes/${product.id}`).set(H).send({ lines: [{ optionId: null, ingredientId: ing.id, qty: 150 }] }).expect(200);
    const mapping = { [p.menus.find((m: { name: string }) => m.name === 'Latte Spesial').key]: product.id };

    const body = { ...payload(), mapping, dates: ['2027-02-01', '2027-02-02'] };
    const r = (await request(app).post('/api/admin/import/esb').set(H).send(body).expect(200)).body;
    expect(r).toMatchObject({ inserted: 3, skipped: 0, total: 103500, cogs: 12000 });
    // Impor ulang berkas yang sama tidak menggandakan.
    expect((await request(app).post('/api/admin/import/esb').set(H).send(body).expect(200)).body).toMatchObject({ inserted: 0, skipped: 3 });
    const again = (await request(app).post('/api/admin/import/esb/preview').set(H).send(payload()).expect(200)).body;
    expect(again.days[0]).toMatchObject({ newBills: 0, alreadyImported: 2 });
    // Pemetaan menu diingat.
    expect(again.menus.find((m: { name: string }) => m.name === 'Latte Spesial')).toMatchObject({ productId: product.id, source: 'saved' });

    const sum = (await request(app).get('/api/reports/summary?from=2027-02-01&to=2027-02-02').set(H).expect(200)).body;
    expect(sum).toMatchObject({ orderCount: 3, grossSales: 102000, serviceTotal: 1300, roundingTotal: 200, netSales: 103500 });
    expect(sum.byCashier).toEqual([expect.objectContaining({ name: 'Impor ESB', count: 3, amount: 103500 })]);
    // Laba kotor = penjualan - HPP dari resep menu yang dicocokkan (stok tetap tidak dipotong).
    expect(sum).toMatchObject({ cogs: 12000, grossProfit: 102000 - 12000 });
    expect(sum.byMethod.map((m: { method: string }) => m.method).sort()).toEqual(['card', 'cash', 'qris']);
    expect(sum.topProducts.find((t: { productId: string }) => t.productId === product.id)).toMatchObject({ name: product.name, qty: 2, amount: 52000 });
    // Waktu bayar lokal (WIB) tersimpan benar untuk peta jam.
    expect(sum.byHour.map((h: { hour: number }) => h.hour)).toEqual([10, 12, 15]);

    const list = (await request(app).get('/api/orders?from=2027-02-01&to=2027-02-01').set(H).expect(200)).body;
    expect(list.every((o: { source: string; deviceId: string | null }) => o.source === 'esb' && o.deviceId === null)).toBe(true);
    const e1 = list.find((o: { number: string }) => o.number === 'B-E1');
    expect(e1.items.reduce((n: number, i: { lineTotal: number }) => n + i.lineTotal, 0)).toBe(52000);
    expect(e1.payment).toMatchObject({ method: 'card', amount: 53500, reference: 'ESB E1' });
    // Stok tidak dipotong.
    const moves = await pool.query("select count(*)::int as n from stock_movements where ref_id = any(select id from orders where source = 'esb')");
    expect(moves.rows[0].n).toBe(0);

    const stored = (await request(app).get('/api/admin/import/esb').set(H).expect(200)).body;
    expect(stored.days.slice(0, 2)).toEqual([
      { date: '2027-02-02', count: 1, total: 24000, revenue: 24000, cogs: 0 },
      { date: '2027-02-01', count: 2, total: 79500, revenue: 78000, cogs: 12000 },
    ]);
    expect(stored.missingRecipes).toEqual(expect.arrayContaining([{ name: 'Es Kopi Susu ESB', qty: 1, unmatched: true }]));
    // Resep diubah (100 ml): hitung ulang HPP tanpa impor ulang.
    await request(app).put(`/api/recipes/${product.id}`).set(H).send({ lines: [{ optionId: null, ingredientId: ing.id, qty: 100 }] }).expect(200);
    await request(app).post('/api/admin/import/esb/recost').set({ Authorization: `Bearer ${barista}` }).send({ from: '2027-02-01', to: '2027-02-02' }).expect(403);
    expect((await request(app).post('/api/admin/import/esb/recost').set(H).send({ from: '2027-02-01', to: '2027-02-02' }).expect(200)).body).toEqual({ cogs: 8000 });
    expect((await request(app).get('/api/reports/summary?from=2027-02-01&to=2027-02-02').set(H)).body).toMatchObject({ cogs: 8000, grossProfit: 94000 });
    expect((await request(app).post('/api/admin/import/esb/delete').set(H).send({ from: '2027-02-01', to: '2027-02-02' }).expect(200)).body).toEqual({ count: 3, total: 103500 });
    expect((await request(app).get('/api/reports/summary?from=2027-02-01&to=2027-02-02').set(H)).body.orderCount).toBe(0);
  });

  it('ukuran lain (nama sama, harga jauh berbeda) disarankan jadi menu baru; impor membuat kategori & menunya di POS', async () => {
    const base = (await request(app).post('/api/admin/import/esb/preview').set(H).send(payload()).expect(200)).body.products[0];
    const big = { name: base.name, category: 'Minuman', sub: '1 Liter', qty: 1, bills: 1, amount: base.price * 4 + 4000 };
    const data = { transactions: [tx('L1', '2027-02-10', '13:00:00', 'Cash (POS)', big.amount)], menuDays: [{ date: '2027-02-10', lines: [big] }] };
    const p = (await request(app).post('/api/admin/import/esb/preview').set(H).send(data).expect(200)).body;
    expect(p.menus[0]).toMatchObject({ productId: 'new', source: 'size' });
    const r = (await request(app).post('/api/admin/import/esb').set(H).send({ ...data, mapping: { [p.menus[0].key]: 'new' }, dates: ['2027-02-10'] }).expect(200)).body;
    expect(r.created).toEqual([{ name: `${base.name} (1 Liter)`, category: '1 Liter', price: big.amount }]);
    const catalog = (await request(app).get('/api/admin/catalog').set(H)).body;
    const cat = catalog.categories.find((c: { name: string }) => c.name === '1 Liter');
    const prod = catalog.products.find((x: { name: string }) => x.name === `${base.name} (1 Liter)`);
    expect(prod).toMatchObject({ categoryId: cat.id, price: big.amount, active: true });
    const sum = (await request(app).get('/api/reports/summary?from=2027-02-10&to=2027-02-10').set(H)).body;
    expect(sum.topProducts[0]).toMatchObject({ productId: prod.id, qty: 1 });
    // Impor berikutnya langsung memakai menu baru itu (tidak membuat menu kedua).
    const again = (await request(app).post('/api/admin/import/esb/preview').set(H).send(data).expect(200)).body;
    expect(again.menus[0]).toMatchObject({ productId: prod.id, source: 'saved' });
    await request(app).post('/api/admin/import/esb/delete').set(H).send({ from: '2027-02-10', to: '2027-02-10' }).expect(200);
  });
});

describe('absen hanya untuk yang terjadwal', () => {
  it('hari yang ada jadwal: yang libur/izin tidak bisa absen; hari tanpa jadwal: semua bisa seperti biasa', async () => {
    const H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    const epoch = (await request(app).get('/api/data-epoch').set(H)).body.id;
    const PHOTO = `data:image/jpeg;base64,${Buffer.from('selfie').toString('base64')}`;
    const clock = (username: string, clockedAt: string) =>
      request(app).put(`/api/tablet/attendance/${randomUUID()}`).set({ ...asDevice(username), ...(epoch ? { 'X-Data-Epoch': epoch } : {}) }).send({ userId: userId(username), clockedAt, photo: PHOTO });
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: true, startTime: '09:00', graceMinutes: 5, storeLat: null, storeLng: null } }).expect(200);
    const shift2 = (await request(app).get('/api/schedule?from=2026-10-05&to=2026-10-05').set(H)).body.templates.find((t: { name: string }) => t.name === 'Shift 2').id;
    // Senin 5 Okt 2026: hanya kitchen terjadwal Shift 2 (15:00); barista izin, kasir tidak dijadwalkan.
    await request(app).put('/api/schedule/entries').set(H).send({ date: '2026-10-05', templateId: shift2, userId: userId('kitchen') }).expect(200);
    await request(app).put('/api/schedule/entries').set(H).send({ date: '2026-10-05', templateId: shift2, userId: userId('barista'), status: 'izin' }).expect(200);

    const kasir = await clock('kasir', '2026-10-05T09:30:00.000Z').expect(400);
    expect(kasir.body.error).toMatch(/tidak terjadwal masuk hari ini/);
    expect((await clock('barista', '2026-10-05T09:30:00.000Z').expect(400)).body.error).toMatch(/tercatat izin/);
    // Yang terjadwal: telat dihitung dari jam shift-nya (15:00 WIB = 08:00 UTC), 16:30 WIB -> 90 menit, dikurangi toleransi 5 menit.
    expect((await clock('kitchen', '2026-10-05T09:30:00.000Z').expect(201)).body.lateMinutes).toBe(85);
    // Hari tanpa jadwal sama sekali: semua bisa absen dengan jam masuk umum.
    await clock('kasir', '2026-10-06T01:50:00.000Z').expect(201);
  });
});

describe('jam masuk acuan telat = jadwal yang terlihat karyawan', () => {
  it('shift yang dihapus tidak dipakai; shift nonaktif tetap terlihat di HP; owner bisa menghitung ulang telat', async () => {
    const H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    const epoch = (await request(app).get('/api/data-epoch').set(H)).body.id;
    const PHOTO = `data:image/jpeg;base64,${Buffer.from('selfie').toString('base64')}`;
    const clock = (username: string, clockedAt: string) =>
      request(app).put(`/api/tablet/attendance/${randomUUID()}`).set({ ...asDevice(username), ...(epoch ? { 'X-Data-Epoch': epoch } : {}) }).send({ userId: userId(username), clockedAt, photo: PHOTO });
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: true, startTime: '09:00', graceMinutes: 0, storeLat: null, storeLng: null } }).expect(200);
    const mk = async (name: string, startTime: string, endTime: string) =>
      (await request(app).post('/api/shift-templates').set(H).send({ name, startTime, endTime, fee: 50000, effectiveFrom: '2026-01-01' }).expect(201)).body.id as string;
    const kitchen = await mk('Kitchen sore', '14:00', '21:00');
    const old = await mk('Pagi lama', '09:00', '16:00');
    const date = '2026-10-17';
    await request(app).put('/api/schedule/entries').set(H).send({ date, templateId: kitchen, userId: userId('barista') }).expect(200);
    await request(app).put('/api/schedule/entries').set(H).send({ date, templateId: old, userId: userId('barista') }).expect(200);

    // Shift lama dinonaktifkan: tetap dihitung, jadi HP karyawan juga harus melihatnya.
    await request(app).patch(`/api/shift-templates/${old}`).set(H).send({ active: false }).expect(200);
    const staffLogin = (await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' }).expect(200)).body.token;
    const seen = (await request(app).get(`/api/schedule?from=${date}&to=${date}`).set({ Authorization: `Bearer ${staffLogin}` }).expect(200)).body;
    expect(seen.templates.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([kitchen, old]));

    // 14:12 WIB = 07:12 UTC; masih terhitung dari 09:00 karena shift "Pagi lama" ada di jadwalnya.
    const first = (await clock('barista', '2026-10-17T07:12:00.000Z').expect(201)).body;
    expect(first.lateMinutes).toBe(312);

    // Owner menghapus shift lama itu lalu menghitung ulang: acuan jadi Kitchen sore 14:00.
    await request(app).delete(`/api/shift-templates/${old}`).set(H).expect(200);
    const row = (await request(app).get(`/api/attendance?from=${date}&to=${date}`).set(H).expect(200)).body.rows.find((r: { userId: string }) => r.userId === userId('barista'));
    expect(row).toMatchObject({ dueTime: '09:00', lateMinutes: 312 });
    await request(app).post(`/api/attendance/${row.id}/recalc`).set({ Authorization: `Bearer ${staffLogin}` }).expect(403);
    const re = (await request(app).post(`/api/attendance/${row.id}/recalc`).set(H).expect(200)).body;
    expect(re).toMatchObject({ dueTime: '14:00', shiftName: 'Kitchen sore', lateMinutes: 12, changed: true });

    // Jam khusus per orang di jadwal ikut dipakai (dan ditampilkan di kartu jadwal HP).
    await request(app).put('/api/schedule/entries').set(H).send({ date, templateId: kitchen, userId: userId('barista'), startTime: '14:10', endTime: '21:00' }).expect(200);
    expect((await request(app).post(`/api/attendance/${row.id}/recalc`).set(H).expect(200)).body).toMatchObject({ dueTime: '14:10', lateMinutes: 2 });

    // "Kembalikan ke jam shift": jam khusus sebulan dihapus dan telat absen yang terpengaruh ikut dihitung ulang.
    await request(app).post('/api/schedule/reset-times').set({ Authorization: `Bearer ${staffLogin}` }).send({ from: '2026-10-01', to: '2026-10-31' }).expect(403);
    const reset = (await request(app).post('/api/schedule/reset-times').set(H).send({ from: '2026-10-01', to: '2026-10-31' }).expect(200)).body;
    expect(reset).toEqual({ cleared: 1, recalculated: 1 });
    const after = (await request(app).get(`/api/attendance?from=${date}&to=${date}`).set(H).expect(200)).body.rows.find((r: { id: string }) => r.id === row.id);
    expect(after).toMatchObject({ dueTime: '14:00', lateMinutes: 12 });
    const sched = (await request(app).get(`/api/schedule?from=${date}&to=${date}`).set(H).expect(200)).body.entries;
    expect(sched.filter((e: { startTime: string | null; endTime: string | null }) => e.startTime || e.endTime)).toEqual([]);
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: false } }).expect(200);
  });
});

describe('gaji mengikuti absen', () => {
  it('sebelum absensi dihitung dianggap masuk; setelahnya tanpa absen & sakit tidak dibayar; owner bisa menandai hadir', async () => {
    const H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    const staff = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'barista', pin: '1111' }).expect(200)).body.token}` };
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: true, startTime: '09:00', graceMinutes: 0, storeLat: null, storeLng: null, countFrom: '2026-09-10' } }).expect(200);
    const shift1 = (await request(app).get('/api/schedule?from=2026-09-07&to=2026-09-07').set(H)).body.templates.find((t: { name: string }) => t.name === 'Shift 1').id;
    const put = (date: string, status = 'masuk') => request(app).put('/api/schedule/entries').set(H).send({ date, templateId: shift1, userId: userId('barista'), status }).expect(200);
    for (const d of ['2026-09-08', '2026-09-11', '2026-09-14']) await put(d);
    await put('2026-09-12', 'sakit');

    // Lupa absen tanggal 14: owner menandai hadir (bukan karyawan sendiri, tidak untuk tanggal mendatang, tidak dobel).
    await request(app).post('/api/attendance/mark').set(staff).send({ userId: userId('barista'), date: '2026-09-14' }).expect(403);
    await request(app).post('/api/attendance/mark').set(H).send({ userId: userId('barista'), date: '2099-01-01' }).expect(400);
    expect((await request(app).post('/api/attendance/mark').set(H).send({ userId: userId('barista'), date: '2026-09-12' }).expect(400)).body.error).toMatch(/tercatat sakit/);
    expect((await request(app).post('/api/attendance/mark').set(H).send({ userId: userId('barista'), date: '2026-09-14' }).expect(201)).body).toMatchObject({ dueTime: '09:00' });
    await request(app).post('/api/attendance/mark').set(H).send({ userId: userId('barista'), date: '2026-09-14' }).expect(400);
    const att = (await request(app).get('/api/attendance?from=2026-09-01&to=2026-09-30').set(H).expect(200)).body;
    expect(att).toMatchObject({ countFrom: '2026-09-10', countFromAuto: false });
    expect(att.rows.find((r: { userId: string; date: string }) => r.userId === userId('barista') && r.date === '2026-09-14')).toMatchObject({ source: 'owner', lateMinutes: 0, hasPhoto: false });

    const pay = (await request(app).get('/api/payroll?month=2026-09').set(H).expect(200)).body;
    const me = pay.people.find((p: { userId: string }) => p.userId === userId('barista'));
    const dates = me.shifts.map((x: { date: string }) => x.date);
    expect(dates).toEqual(expect.arrayContaining(['2026-09-08', '2026-09-14']));
    expect(dates).not.toContain('2026-09-11');
    expect(dates).not.toContain('2026-09-12');
    expect(me.absences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-09-11', status: 'alpa', note: 'Tidak absen' }),
        expect.objectContaining({ date: '2026-09-12', status: 'sakit' }),
      ]),
    );
    await request(app).put('/api/settings').set(H).send({ attendance: { enabled: false, countFrom: null } }).expect(200);
  });
});

describe('kasir masih buka: tutup paksa owner & penyamaan tablet', () => {
  it('owner melihat shift terbuka, menutup paksa dari back office; tablet melihatnya tertutup; tablet tanpa data lokal bisa melanjutkan shift', async () => {
    const H = { Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ username: 'owner', password: 'Teh-tarik-88' }).expect(200)).body.token}` };
    const epoch = (await request(app).get('/api/data-epoch').set(H)).body.id;
    const dev = () => ({ ...asDevice('kasir'), ...(epoch ? { 'X-Data-Epoch': epoch } : {}) });
    const boot = (await request(app).get('/api/sync/bootstrap').set(asDevice('kasir')).expect(200)).body;
    const now = new Date().toISOString();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const day: BusinessDay = { id: randomUUID(), deviceId: 'client', businessDate: date, openedAt: now, openedById: userId('kasir'), openedByName: 'Kasir 1', closedAt: null, closedById: null, closedByName: '', closingNote: '', shiftIds: [], summary: null };
    const shift: Shift = { id: randomUUID(), deviceId: 'client', businessDayId: day.id, openedAt: now, openedById: userId('kasir'), openedByName: 'Kasir 1', openingCash: 50000, cashMovements: [], closedAt: null, closedById: null, closedByName: '', countedCash: null, closingNote: '', summary: null };
    await request(app).put(`/api/business-days/${day.id}`).set(dev()).send(day).expect(200);
    await request(app).put(`/api/shifts/${shift.id}`).set(dev()).send(shift).expect(200);
    const number = `${boot.device.code}${date.slice(2).replace(/-/g, '')}-007`;
    const order = makeOrder('Americano', [], 2, { shiftId: shift.id, number });
    await request(app).put(`/api/orders/${order.id}`).set(dev()).send(order).expect(201);

    // Tablet yang kehilangan data lokalnya: server memberi shift terbuka + transaksinya + nomor struk terakhir.
    const st = (await request(app).get('/api/tablet/open-state').set(asDevice('kasir')).expect(200)).body;
    expect(st.open.shift.id).toBe(shift.id);
    expect(st.open.day.id).toBe(day.id);
    expect(st.open.orders.map((o: { id: string }) => o.id)).toEqual([order.id]);
    expect(st.lastSeq).toEqual({ date, seq: 7 });
    // Nomor struk yang terulang tidak membuat kiriman macet: disimpan dengan akhiran.
    const twin = makeOrder('Americano', [], 1, { shiftId: shift.id, number });
    expect((await request(app).put(`/api/orders/${twin.id}`).set(dev()).send(twin)).status).toBe(201);
    expect((await pool.query('select number from orders where id = $1', [twin.id])).rows[0].number).toBe(`${number}-2`);

    // Owner melihat kasir yang masih buka beserta rekap sementaranya; kasir/tablet tidak boleh.
    await request(app).get('/api/admin/open-state').set(asDevice('kasir')).expect(403);
    const os = (await request(app).get('/api/admin/open-state').set(H).expect(200)).body;
    const mine = os.shifts.find((s: { id: string }) => s.id === shift.id);
    expect(mine.liveSummary).toMatchObject({ orderCount: 2, netSales: order.total + twin.total, expectedCash: 50000 + order.total + twin.total });

    // Tablet melaporkan kiriman yang ditolak; owner melihatnya.
    await request(app).put('/api/tablet/sync-issues').set(dev()).send({ items: [{ label: 'Tutup hari', path: `/business-days/${day.id}`, error: 'Hari usaha bukan milik terminal ini', createdAt: now }] }).expect(200);
    expect((await request(app).get('/api/admin/open-state').set(H)).body.issues[0].items[0]).toMatchObject({ label: 'Tutup hari', error: 'Hari usaha bukan milik terminal ini' });
    await request(app).put('/api/tablet/sync-issues').set(dev()).send({ items: [] }).expect(200);
    expect((await request(app).get('/api/admin/open-state').set(H)).body.issues).toEqual([]);

    // Tutup paksa: rekap dari server, hari ikut tertutup.
    const counted = 50000 + order.total + twin.total;
    const fc = (await request(app).post(`/api/admin/shifts/${shift.id}/force-close`).set(H).send({ countedCash: counted, note: 'dihitung barista' }).expect(200)).body;
    expect(fc).toMatchObject({ dayClosed: true, summary: { orderCount: 2 } });
    await request(app).post(`/api/admin/shifts/${shift.id}/force-close`).set(H).send({ countedCash: null }).expect(400);
    const saved = (await pool.query('select closed_by_name, counted_cash, closing_note from shifts where id = $1', [shift.id])).rows[0];
    expect(saved).toMatchObject({ closed_by_name: 'Owner (tutup paksa)', counted_cash: counted, closing_note: 'Ditutup paksa owner dari back office: dihitung barista' });
    const after = (await request(app).get('/api/admin/open-state').set(H)).body;
    expect(after.shifts.some((s: { id: string }) => s.id === shift.id)).toBe(false);
    expect(after.days.some((d: { id: string }) => d.id === day.id)).toBe(false);

    // Tablet yang masih memegang shift ini mengetahui bahwa shift & harinya sudah ditutup.
    const tb = (await request(app).get(`/api/tablet/open-state?shiftId=${shift.id}&dayId=${day.id}`).set(asDevice('kasir'))).body;
    expect(tb.shift.closedAt).toBeTruthy();
    expect(tb.day.closedAt).toBeTruthy();
    expect(tb.open?.shift.id).not.toBe(shift.id);
    // Kiriman tutup shift/hari yang terlambat dari tablet tidak mengubah apa pun.
    const late = { ...shift, closedAt: new Date().toISOString(), closedById: userId('kasir'), closedByName: 'Kasir 1', countedCash: 1, summary: computeShiftSummary(shift, [order, twin]) };
    expect((await request(app).put(`/api/shifts/${shift.id}`).set(dev()).send(late).expect(200)).body.status).toBe('closed-unchanged');
    expect((await pool.query('select counted_cash from shifts where id = $1', [shift.id])).rows[0].counted_cash).toBe(counted);
  });
});
