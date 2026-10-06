import { Router } from 'express';
import { z } from 'zod';
import { businessDate, validateOrderMath, type Order } from '@mourden/shared';
import { need, needDevice } from '../auth';
import { audit, pool, tx, type Db } from '../db';
import { badRequest, dateRangeQuery, forbidden, notFound, parse } from '../http';
import { getSettings, getTimezone } from '../repo';

export const ordersRouter = Router();

const uuid = z.uuid();
const money = z.number().int().min(0);
const iso = z.iso.datetime({ offset: true });

const orderSchema = z.object({
  id: uuid,
  number: z.string().min(1).max(40),
  deviceId: z.string(),
  shiftId: uuid,
  cashierId: uuid,
  cashierName: z.string().max(60),
  createdAt: iso,
  customerName: z.string().max(60),
  items: z
    .array(
      z.object({
        id: uuid,
        productId: uuid,
        name: z.string().min(1).max(120),
        basePrice: money,
        unitPrice: money,
        qty: z.number().int().min(1).max(999),
        options: z.array(
          z.object({ optionId: uuid, groupName: z.string().max(60), name: z.string().max(60), priceDelta: z.number().int() }),
        ),
        note: z.string().max(200),
        lineTotal: money,
      }),
    )
    .min(1)
    .max(200),
  discount: z
    .object({ type: z.enum(['percent', 'amount']), value: z.number().min(0), reason: z.string().max(100) })
    .nullable(),
  servicePct: z.number().min(0).max(100),
  taxPct: z.number().min(0).max(100),
  taxLabel: z.string().max(12),
  subtotal: money,
  discountAmount: money,
  serviceAmount: money,
  taxAmount: money,
  roundingAmount: z.number().int(),
  total: money,
  payment: z.object({
    method: z.enum(['cash', 'qris', 'card']),
    amount: money,
    tendered: money,
    change: money,
    reference: z.string().max(60),
  }),
  status: z.enum(['paid', 'void']),
  voidReason: z.string().max(200),
  voidedAt: iso.nullable(),
  voidedById: uuid.nullable(),
  voidedByName: z.string().max(60),
  voidApprovedById: uuid.nullable(),
});

const voidSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan minimal 3 huruf').max(200),
  voidedAt: iso,
  voidedById: uuid,
  voidedByName: z.string().max(60),
  approvedById: uuid.nullable(),
});

/**
 * Menyimpan transaksi dari tablet. Idempotent: kirim ulang dengan ID yang sama tidak membuat duplikat.
 * Stok bahan dipotong sesuai resep produk + opsi yang dipilih.
 */
ordersRouter.put('/orders/:id', needDevice, need('pos.sell'), async (req, res) => {
  const order = parse(orderSchema, req.body) as Order;
  if (order.id !== req.params.id) throw badRequest('ID tidak cocok');
  const problems = validateOrderMath(order);
  if (problems.length) throw badRequest(`Perhitungan transaksi tidak valid: ${problems.join(', ')}`, problems);

  const tz = await getTimezone(pool);
  const result = await tx(async (c) => {
    const { rowCount } = await c.query(
      `insert into orders (
         id, number, device_id, shift_id, cashier_id, cashier_name, created_at, business_date, customer_name,
         discount, subtotal, discount_amount, service_pct, service_amount, tax_pct, tax_label, tax_amount,
         rounding_amount, total, payment_method, payment_amount, tendered, change, payment_reference
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       on conflict (id) do nothing`,
      [
        order.id,
        order.number,
        req.auth.device!.id,
        order.shiftId,
        order.cashierId,
        order.cashierName,
        order.createdAt,
        businessDate(order.createdAt, tz),
        order.customerName,
        order.discount ? JSON.stringify(order.discount) : null,
        order.subtotal,
        order.discountAmount,
        order.servicePct,
        order.serviceAmount,
        order.taxPct,
        order.taxLabel,
        order.taxAmount,
        order.roundingAmount,
        order.total,
        order.payment.method,
        order.payment.amount,
        order.payment.tendered,
        order.payment.change,
        order.payment.reference,
      ],
    );
    if (!rowCount) return 'exists' as const;

    for (const [i, item] of order.items.entries()) {
      await c.query(
        `insert into order_items (id, order_id, product_id, name, base_price, unit_price, qty, options, note, line_total, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [item.id, order.id, item.productId, item.name, item.basePrice, item.unitPrice, item.qty, JSON.stringify(item.options), item.note, item.lineTotal, i],
      );
    }
    await deductStockForOrder(c, order.id, order.cashierId, order.createdAt);
    // Transaksi yang dibatalkan saat offline dikirim dengan status void: catat pembatalannya juga.
    if (order.status === 'void') {
      await applyVoid(c, order.id, {
        reason: order.voidReason || 'Dibatalkan',
        voidedAt: order.voidedAt ?? order.createdAt,
        voidedById: order.voidedById ?? order.cashierId,
        voidedByName: order.voidedByName,
        approvedById: order.voidApprovedById,
      });
    }
    await audit(c, req.auth.user!.id, 'create', 'order', order.id, { number: order.number, total: order.total });
    return 'created' as const;
  });
  res.status(result === 'created' ? 201 : 200).json({ ok: true, status: result });
});

async function deductStockForOrder(c: Db, orderId: string, userId: string, at: string) {
  await c.query(
    `insert into stock_movements (ingredient_id, qty, type, unit_cost, ref_type, ref_id, user_id, created_at)
     select ri.ingredient_id, -sum(ri.qty * oi.qty), 'sale', max(i.cost_per_unit), 'order', $1, $2, $3
     from order_items oi
     join recipe_items ri on ri.product_id = oi.product_id
       and (ri.option_id is null or exists (
         select 1 from jsonb_array_elements(oi.options) e where e->>'optionId' = ri.option_id::text
       ))
     join ingredients i on i.id = ri.ingredient_id
     where oi.order_id = $1
     group by ri.ingredient_id`,
    [orderId, userId, at],
  );
}

async function applyVoid(c: Db, orderId: string, v: z.infer<typeof voidSchema>) {
  const { rowCount } = await c.query(
    `update orders set status = 'void', void_reason = $2, voided_at = $3, voided_by = $4, voided_by_name = $5, void_approved_by = $6
     where id = $1 and status = 'paid'`,
    [orderId, v.reason, v.voidedAt, v.voidedById, v.voidedByName, v.approvedById],
  );
  if (!rowCount) return false;
  // Kembalikan stok bahan yang tadinya terpotong.
  await c.query(
    `insert into stock_movements (ingredient_id, qty, type, unit_cost, ref_type, ref_id, user_id, created_at, note)
     select ingredient_id, -qty, 'void', unit_cost, 'order', ref_id, $2, $3, $4
     from stock_movements where ref_type = 'order' and ref_id = $1 and type = 'sale'`,
    [orderId, v.voidedById, v.voidedAt, v.reason],
  );
  return true;
}

/** Pembatalan transaksi. Idempotent: membatalkan yang sudah batal tidak mengubah apa pun. */
ordersRouter.post('/orders/:id/void', need('pos.void'), async (req, res) => {
  const body = parse(voidSchema, req.body);
  const actor = req.auth.user!;
  const settings = await getSettings(pool);
  if (actor.role !== 'owner' && settings.policy.voidRequiresOwnerPin) {
    if (!body.approvedById) throw forbidden('Pembatalan butuh persetujuan owner');
    const { rows } = await pool.query("select 1 from users where id = $1 and role = 'owner' and active", [body.approvedById]);
    if (!rows[0]) throw forbidden('Persetujuan owner tidak valid');
  }
  const changed = await tx(async (c) => {
    const { rows } = await c.query('select id, status, shift_id from orders where id = $1 for update', [req.params.id]);
    if (!rows[0]) throw notFound('Transaksi belum tersinkron atau tidak ditemukan');
    const ok = await applyVoid(c, String(req.params.id), { ...body, voidedById: actor.id });
    if (ok) await audit(c, actor.id, 'void', 'order', String(req.params.id), { reason: body.reason, approvedBy: body.approvedById });
    return ok;
  });
  res.json({ ok: true, status: changed ? 'voided' : 'already-void' });
});

// ---------- Owner: daftar & detail transaksi ----------

const listQuery = dateRangeQuery.extend({
  status: z.enum(['paid', 'void', 'all']).default('all'),
  q: z.string().max(60).optional(),
});

ordersRouter.get('/orders', need('admin'), async (req, res) => {
  const q = parse(listQuery, req.query);
  const params: unknown[] = [q.from, q.to];
  let where = 'business_date between $1 and $2';
  if (q.status !== 'all') {
    params.push(q.status);
    where += ` and status = $${params.length}`;
  }
  if (q.q) {
    params.push(`%${q.q}%`);
    where += ` and (number ilike $${params.length} or customer_name ilike $${params.length})`;
  }
  const { rows } = await pool.query(`${orderSelect} where ${where} order by created_at desc limit 500`, params);
  res.json(await withItems(rows));
});

ordersRouter.get('/orders/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query(`${orderSelect} where id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound();
  res.json((await withItems(rows))[0]);
});

const orderSelect = `
  select id, number, device_id as "deviceId", shift_id as "shiftId", cashier_id as "cashierId", cashier_name as "cashierName",
    created_at as "createdAt", customer_name as "customerName", discount, subtotal, discount_amount as "discountAmount",
    service_pct as "servicePct", service_amount as "serviceAmount", tax_pct as "taxPct", tax_label as "taxLabel",
    tax_amount as "taxAmount", rounding_amount as "roundingAmount", total,
    json_build_object('method', payment_method, 'amount', payment_amount, 'tendered', tendered, 'change', change,
      'reference', payment_reference) as payment,
    status, void_reason as "voidReason", voided_at as "voidedAt", voided_by as "voidedById", voided_by_name as "voidedByName",
    void_approved_by as "voidApprovedById"
  from orders`;

async function withItems(orders: Record<string, unknown>[]) {
  if (!orders.length) return [];
  const { rows } = await pool.query(
    `select id, order_id, product_id as "productId", name, base_price as "basePrice", unit_price as "unitPrice", qty, options,
       note, line_total as "lineTotal"
     from order_items where order_id = any($1::uuid[]) order by sort`,
    [orders.map((o) => o.id)],
  );
  return orders.map((o) => ({
    ...o,
    createdAt: (o.createdAt as Date).toISOString(),
    voidedAt: o.voidedAt ? (o.voidedAt as Date).toISOString() : null,
    items: rows.filter((i) => i.order_id === o.id).map(({ order_id: _, ...i }) => i),
  }));
}

// ---------- Shift ----------

const shiftSchema = z.object({
  id: uuid,
  deviceId: z.string(),
  openedById: uuid,
  openedByName: z.string().max(60),
  openedAt: iso,
  openingCash: money,
  cashMovements: z
    .array(
      z.object({
        id: z.string().max(40),
        type: z.enum(['in', 'out']),
        amount: money,
        note: z.string().max(120),
        at: z.string().max(40),
        userName: z.string().max(60),
      }),
    )
    .max(200),
  closedById: uuid.nullable(),
  closedByName: z.string().max(60),
  closedAt: iso.nullable(),
  countedCash: money.nullable(),
  closingNote: z.string().max(300),
  summary: z.record(z.string(), z.unknown()).nullable(),
});

/** Simpan/update shift dari tablet. Shift yang sudah ditutup tidak bisa diubah lagi. */
ordersRouter.put('/shifts/:id', needDevice, need('pos.shift'), async (req, res) => {
  const s = parse(shiftSchema, req.body);
  if (s.id !== req.params.id) throw badRequest('ID tidak cocok');
  const { rowCount } = await pool.query(
    `insert into shifts (id, device_id, opened_by, opened_by_name, opened_at, opening_cash, cash_movements,
       closed_by, closed_by_name, closed_at, counted_cash, closing_note, summary)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (id) do update set
       cash_movements = excluded.cash_movements, closed_by = excluded.closed_by, closed_by_name = excluded.closed_by_name,
       closed_at = excluded.closed_at, counted_cash = excluded.counted_cash, closing_note = excluded.closing_note,
       summary = excluded.summary, updated_at = now()
     where shifts.closed_at is null`,
    [
      s.id,
      req.auth.device!.id,
      s.openedById,
      s.openedByName,
      s.openedAt,
      s.openingCash,
      JSON.stringify(s.cashMovements),
      s.closedById,
      s.closedByName,
      s.closedAt,
      s.countedCash,
      s.closingNote,
      s.summary ? JSON.stringify(s.summary) : null,
    ],
  );
  res.json({ ok: true, status: rowCount ? 'saved' : 'closed-unchanged' });
});

ordersRouter.get('/shifts', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const tz = await getTimezone(pool);
  const { rows } = await pool.query(
    `select id, opened_by_name as "openedByName", opened_at as "openedAt", opening_cash as "openingCash",
       cash_movements as "cashMovements", closed_by_name as "closedByName", closed_at as "closedAt",
       counted_cash as "countedCash", closing_note as "closingNote", summary
     from shifts where (opened_at at time zone $3)::date between $1 and $2 order by opened_at desc`,
    [q.from, q.to, tz],
  );
  res.json(rows);
});

