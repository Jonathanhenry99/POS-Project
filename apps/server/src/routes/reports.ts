import { Router } from 'express';
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, type OrderType, type PaymentMethod } from '@mourden/shared';
import { need } from '../auth';
import { pool } from '../db';
import { dateRangeQuery, parse } from '../http';
import { getStockLevels, getTimezone } from '../repo';

export const reportsRouter = Router();

/** Ringkasan penjualan untuk rentang tanggal (zona waktu toko). Transaksi void tidak dihitung sebagai penjualan. */
reportsRouter.get('/reports/summary', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const tz = await getTimezone(pool);
  const range = [q.from, q.to];
  const paid = "business_date between $1 and $2 and status = 'paid'";

  const [totals, voids, byMethod, byHour, byDay, top, byCategory, cogs, heatmap, slow, byType] = await Promise.all([
    pool.query(
      `select count(*)::int as "orderCount", coalesce(sum(subtotal), 0)::int as "grossSales",
         coalesce(sum(discount_amount), 0)::int as "discountTotal", coalesce(sum(service_amount), 0)::int as "serviceTotal",
         coalesce(sum(tax_amount), 0)::int as "taxTotal", coalesce(sum(rounding_amount), 0)::int as "roundingTotal",
         coalesce(sum(total), 0)::int as "netSales"
       from orders where ${paid}`,
      range,
    ),
    pool.query(
      `select count(*)::int as count, coalesce(sum(total), 0)::int as amount,
         coalesce(sum(total) filter (where payment_method = 'cash'), 0)::int as "cashAmount",
         count(*) filter (where payment_method = 'cash')::int as "cashCount"
       from orders where business_date between $1 and $2 and status = 'void'`,
      range,
    ),
    pool.query(
      `select payment_method as method, count(*)::int as count, sum(total)::int as amount
       from orders where ${paid} group by payment_method order by amount desc`,
      range,
    ),
    pool.query(
      `select extract(hour from created_at at time zone $3)::int as hour, count(*)::int as count, sum(total)::int as amount
       from orders where ${paid} group by 1 order by 1`,
      [...range, tz],
    ),
    pool.query(
      `select business_date as date, count(*)::int as count, sum(total)::int as amount
       from orders where ${paid} group by 1 order by 1`,
      range,
    ),
    pool.query(
      `select oi.product_id as "productId", oi.name, sum(oi.qty)::int as qty, sum(oi.line_total)::int as amount
       from order_items oi join orders o on o.id = oi.order_id
       where o.business_date between $1 and $2 and o.status = 'paid'
       group by oi.product_id, oi.name order by qty desc, amount desc limit 15`,
      range,
    ),
    pool.query(
      `select coalesce(c.name, 'Lainnya') as name, sum(oi.qty)::int as qty, sum(oi.line_total)::int as amount
       from order_items oi join orders o on o.id = oi.order_id
       left join products p on p.id = oi.product_id left join categories c on c.id = p.category_id
       where o.business_date between $1 and $2 and o.status = 'paid'
       group by 1 order by amount desc`,
      range,
    ),
    // HPP = biaya bahan yang tercatat saat penjualan (dikurangi pengembalian dari void).
    pool.query(
      `select coalesce(-sum(m.qty * m.unit_cost), 0)::float8 as cogs
       from stock_movements m join orders o on o.id = m.ref_id
       where m.ref_type = 'order' and m.type in ('sale', 'void') and o.business_date between $1 and $2`,
      range,
    ),
    // Peta keramaian: hari (1=Senin..7=Minggu) x jam.
    pool.query(
      `select extract(isodow from created_at at time zone $3)::int as dow, extract(hour from created_at at time zone $3)::int as hour,
         count(*)::int as count, sum(total)::int as amount
       from orders where ${paid} group by 1, 2`,
      [...range, tz],
    ),
    // Menu aktif yang tidak terjual sama sekali di rentang ini.
    pool.query(
      `select p.id, p.name from products p
       where p.active and not exists (
         select 1 from order_items oi join orders o on o.id = oi.order_id
         where oi.product_id = p.id and o.business_date between $1 and $2 and o.status = 'paid'
       ) order by p.name limit 20`,
      range,
    ),
    pool.query(
      `select order_type as type, count(*)::int as count, sum(total)::int as amount
       from orders where ${paid} group by 1 order by amount desc`,
      range,
    ),
  ]);

  const t = totals.rows[0];
  const revenue = t.grossSales - t.discountTotal;
  const cogsValue = Math.round(cogs.rows[0].cogs);
  res.json({
    from: q.from,
    to: q.to,
    ...t,
    avgTicket: t.orderCount ? Math.round(t.netSales / t.orderCount) : 0,
    voidCount: voids.rows[0].count,
    voidAmount: voids.rows[0].amount,
    voidCash: { count: voids.rows[0].cashCount, amount: voids.rows[0].cashAmount },
    voidNonCash: { count: voids.rows[0].count - voids.rows[0].cashCount, amount: voids.rows[0].amount - voids.rows[0].cashAmount },
    discountCount: (await pool.query(`select count(*)::int as n from orders where ${paid} and discount_amount > 0`, range)).rows[0].n,
    byMethod: byMethod.rows.map((r) => ({ ...r, label: PAYMENT_LABEL[r.method as PaymentMethod] })),
    byHour: byHour.rows,
    byDay: byDay.rows,
    topProducts: top.rows,
    byCategory: byCategory.rows,
    cogs: cogsValue,
    grossProfit: revenue - cogsValue,
    grossMarginPct: revenue > 0 ? Math.round(((revenue - cogsValue) / revenue) * 1000) / 10 : 0,
    heatmap: heatmap.rows,
    slowMovers: slow.rows,
    byOrderType: byType.rows.map((r) => ({ ...r, label: ORDER_TYPE_LABEL[r.type as OrderType] })),
  });
});

/** Ringkasan untuk beranda owner: penjualan hari ini + peringatan stok. */
reportsRouter.get('/reports/alerts', need('admin'), async (_req, res) => {
  const tz = await getTimezone(pool);
  const levels = await getStockLevels(pool);
  const { rows: pending } = await pool.query(
    `select o.id, o.station, o.business_date as "businessDate", o.user_name as "userName",
       coalesce(sum(oi.diff * oi.unit_cost), 0)::float8 as "diffValue"
     from opnames o join opname_items oi on oi.opname_id = o.id
     where o.business_date >= (now() at time zone $1)::date - 7
     group by o.id having sum(abs(oi.diff)) > 0 order by o.created_at desc limit 10`,
    [tz],
  );
  res.json({
    lowStock: levels.filter((l) => l.status !== 'aman'),
    opnameVariances: pending,
  });
});

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ekspor transaksi per baris item ke CSV (bisa dibuka di Excel/Google Sheets). */
reportsRouter.get('/reports/orders.csv', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const tz = await getTimezone(pool);
  const { rows } = await pool.query(
    `select o.number, to_char(o.created_at at time zone $3, 'YYYY-MM-DD HH24:MI') as waktu, o.cashier_name, o.customer_name,
       o.status, o.void_reason, o.payment_method, oi.name as item, oi.options, oi.qty, oi.unit_price, oi.line_total,
       o.subtotal, o.discount_amount, o.service_amount, o.tax_amount, o.rounding_amount, o.total
     from orders o join order_items oi on oi.order_id = o.id
     where o.business_date between $1 and $2 order by o.created_at, oi.sort`,
    [q.from, q.to, tz],
  );
  const header = [
    'No', 'Waktu', 'Kasir', 'Pelanggan', 'Status', 'Alasan Void', 'Metode', 'Item', 'Opsi', 'Qty', 'Harga', 'Total Item',
    'Subtotal', 'Diskon', 'Service', 'Pajak', 'Pembulatan', 'Total',
  ];
  const lines = rows.map((r) =>
    [
      r.number, r.waktu, r.cashier_name, r.customer_name, r.status === 'void' ? 'VOID' : 'Lunas', r.void_reason,
      PAYMENT_LABEL[r.payment_method as PaymentMethod], r.item,
      (r.options as { name: string }[]).map((o) => o.name).join(' + '),
      r.qty, r.unit_price, r.line_total, r.subtotal, r.discount_amount, r.service_amount, r.tax_amount, r.rounding_amount, r.total,
    ]
      .map(csvCell)
      .join(','),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transaksi_${q.from}_${q.to}.csv"`);
  // BOM agar Excel membaca UTF-8 dengan benar.
  res.send('﻿' + [header.join(','), ...lines].join('\n'));
});
