// Pengawasan: tablet mengirim aktivitas kasir yang berisiko; owner melihat daftar "Perlu ditinjau".
import { Router } from 'express';
import { z } from 'zod';
import { buildReview, businessDate, type CashierEvent } from '@mourden/shared';
import { need, needDevice } from '../auth';
import { pool } from '../db';
import { badRequest, dateRangeQuery, parse } from '../http';
import { getSettings, getTimezone } from '../repo';

export const reviewRouter = Router();

const eventSchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
  type: z.enum(['bill_printed', 'order_deleted', 'item_removed']),
  orderRef: z.string().max(60),
  label: z.string().max(80),
  amount: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  itemCount: z.number().int().min(0).max(100_000),
  billPrints: z.number().int().min(0).max(1000),
  reason: z.string().max(200),
  detail: z.string().max(300),
});

/** Idempotent: ID dibuat tablet, kirim ulang dari antrean offline tidak menggandakan catatan. */
reviewRouter.put('/tablet/events/:id', needDevice, need('pos.sell'), async (req, res) => {
  const e = parse(eventSchema, req.body) as CashierEvent;
  if (e.id !== req.params.id) throw badRequest('ID tidak cocok');
  const tz = await getTimezone(pool);
  await pool.query(
    `insert into cashier_events (id, device_id, user_id, user_name, at, business_date, type, order_ref, label, amount, item_count, bill_prints, reason, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (id) do nothing`,
    [e.id, req.auth.device!.id, req.auth.user!.id, req.auth.user!.name, e.at, businessDate(e.at, tz), e.type, e.orderRef, e.label, e.amount, e.itemCount, e.billPrints, e.reason, e.detail],
  );
  res.json({ ok: true });
});

reviewRouter.get('/reports/review', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const tz = await getTimezone(pool);
  const range = [q.from, q.to];
  const perDay = (await getSettings(pool)).comp?.perDay ?? 1;
  const [events, voids, discounts, freeItems, drawers, shifts, marks, comps] = await Promise.all([
    pool.query(
      `select id, at, type, order_ref as "orderRef", label, amount, item_count as "itemCount", bill_prints as "billPrints", reason, detail, user_name as "userName"
       from cashier_events where business_date between $1 and $2`,
      range,
    ),
    pool.query(
      `select id, number, cashier_name as "cashierName", voided_by_name as "voidedByName", void_reason as reason, total, payment_method as method,
         coalesce(voided_at, created_at) as "voidedAt", void_approved_by is not null as approved
       from orders where status = 'void' and business_date between $1 and $2`,
      range,
    ),
    pool.query(
      `select id, number, cashier_name as "cashierName", created_at as at, subtotal, discount_amount as "discountAmount", coalesce(discount->>'reason', '') as reason
       from orders where status = 'paid' and discount_amount > 0 and comp_employee_id is null and business_date between $1 and $2`,
      range,
    ),
    pool.query(
      `select oi.id, o.number, o.cashier_name as "cashierName", o.created_at as at, oi.name, oi.qty
       from order_items oi join orders o on o.id = oi.order_id
       where o.status = 'paid' and oi.unit_price = 0 and o.comp_employee_id is null and o.business_date between $1 and $2`,
      range,
    ),
    pool.query(
      `select entity_id as id, at, coalesce(data->>'userName', '') as "userName"
       from audit_log where entity = 'printer-action' and (at at time zone $3)::date between $1 and $2`,
      [...range, tz],
    ),
    pool.query(
      `select id, closed_at as "closedAt", closed_by_name as "closedByName", coalesce((summary->>'expectedCash')::int, 0) as "expectedCash", counted_cash as "countedCash",
         json_build_object('qris', coalesce((summary->'byMethod'->>'qris')::int, 0), 'card', coalesce((summary->'byMethod'->>'card')::int, 0)) as "nonCash", settlement
       from shifts where closed_at is not null and counted_cash is not null and summary is not null and (closed_at at time zone $3)::date between $1 and $2`,
      [...range, tz],
    ),
    pool.query<{ key: string }>('select key from review_marks'),
    // Komplimen yang membuat total harian seorang karyawan melewati jatahnya (urut waktu; yang masih dalam jatah tidak ditandai).
    pool.query(
      `select * from (
         select o.id, o.number, o.created_at as at, o.cashier_name as "cashierName", o.comp_employee_name as "employeeName",
           o.subtotal as value, o.comp_approved_by is not null as approved, q.qty,
           (sum(q.qty) over (partition by o.comp_employee_id, o.business_date order by o.created_at, o.id))::int as "dayQty"
         from orders o
         join lateral (select coalesce(sum(qty), 0)::int as qty from order_items where order_id = o.id) q on true
         where o.status = 'paid' and o.comp_employee_id is not null and o.business_date between $1 and $2
       ) c where c."dayQty" > $3`,
      [...range, perDay],
    ),
  ]);
  const iso = <T extends Record<string, unknown>>(rows: T[], ...keys: string[]) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, new Date(r[k] as string).toISOString()])) }));
  const items = buildReview({
    events: iso(events.rows, 'at') as never,
    voids: iso(voids.rows, 'voidedAt') as never,
    discounts: iso(discounts.rows, 'at') as never,
    freeItems: iso(freeItems.rows, 'at') as never,
    drawers: iso(drawers.rows, 'at') as never,
    shifts: iso(shifts.rows, 'closedAt') as never,
    comps: iso(comps.rows.map((c) => ({ ...c, perDay })), 'at') as never,
    reviewed: new Set(marks.rows.map((m) => m.key)),
  });
  const open = items.filter((i) => !i.reviewed);
  res.json({ from: q.from, to: q.to, items, open: open.length, high: open.filter((i) => i.severity === 'high').length });
});

const markBody = z.object({ keys: z.array(z.string().min(3).max(120)).min(1).max(500), reviewed: z.boolean() });

reviewRouter.post('/reports/review/mark', need('admin'), async (req, res) => {
  const b = parse(markBody, req.body);
  if (b.reviewed) {
    await pool.query('insert into review_marks (key, user_id) select unnest($1::text[]), $2 on conflict (key) do nothing', [b.keys, req.auth.user!.id]);
  } else {
    await pool.query('delete from review_marks where key = any($1::text[])', [b.keys]);
  }
  res.json({ ok: true });
});
