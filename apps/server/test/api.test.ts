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
    expect(boot.settings.attendance).toEqual({ enabled: true, startTime: '09:00', graceMinutes: 5, storeLat: null, storeLng: null, radiusM: 150 });
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
