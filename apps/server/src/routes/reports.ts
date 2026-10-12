import { Router } from 'express';
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, analyzeMenu, analyzeVariance, businessDate, type MenuSalesRow, type OrderType, type PaymentMethod, type VarianceInput } from '@mourden/shared';
import { need } from '../auth';
import { pool } from '../db';
import { dateRangeQuery, parse } from '../http';
import { getSettings, getStockLevels, getTimezone } from '../repo';

export const reportsRouter = Router();

/** Ringkasan penjualan untuk rentang tanggal (zona waktu toko). Transaksi void tidak dihitung sebagai penjualan. */
reportsRouter.get('/reports/summary', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const tz = await getTimezone(pool);
  const range = [q.from, q.to];
  // Komplimen karyawan (comp_employee_id terisi) bukan penjualan: dilaporkan terpisah di /reports/comps.
  const paid = "business_date between $1 and $2 and status = 'paid' and comp_employee_id is null";

  const [totals, voids, byMethod, byHour, byDay, top, byCategory, cogs, heatmap, slow, byType, byCashier, items, recent] = await Promise.all([
    pool.query(
      `select count(*)::int as "orderCount", coalesce(sum(subtotal), 0)::int as "grossSales",
         coalesce(sum(discount_amount), 0)::int as "discountTotal", coalesce(sum(service_amount), 0)::int as "serviceTotal",
         coalesce(sum(tax_amount), 0)::int as "taxTotal", coalesce(sum(rounding_amount), 0)::int as "roundingTotal",
         coalesce(sum(total), 0)::int as "netSales", coalesce(sum(pax), 0)::int as "paxTotal"
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
       where o.business_date between $1 and $2 and o.status = 'paid' and o.comp_employee_id is null
       group by oi.product_id, oi.name order by qty desc, amount desc limit 15`,
      range,
    ),
    pool.query(
      `select coalesce(c.name, 'Lainnya') as name, sum(oi.qty)::int as qty, sum(oi.line_total)::int as amount
       from order_items oi join orders o on o.id = oi.order_id
       left join products p on p.id = oi.product_id left join categories c on c.id = p.category_id
       where o.business_date between $1 and $2 and o.status = 'paid' and o.comp_employee_id is null
       group by 1 order by amount desc`,
      range,
    ),
    // HPP = biaya bahan yang tercatat saat penjualan (dikurangi pengembalian dari void).
    pool.query(
      `select coalesce(-sum(m.qty * m.unit_cost), 0)::float8 as cogs
       from stock_movements m join orders o on o.id = m.ref_id
       where m.ref_type = 'order' and m.type in ('sale', 'void') and o.comp_employee_id is null and o.business_date between $1 and $2`,
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
         where oi.product_id = p.id and o.business_date between $1 and $2 and o.status = 'paid' and o.comp_employee_id is null
       ) order by p.name limit 20`,
      range,
    ),
    pool.query(
      `select order_type as type, count(*)::int as count, sum(total)::int as amount
       from orders where ${paid} group by 1 order by amount desc`,
      range,
    ),
    // Kinerja kasir: penjualan, diskon yang diberikan, dan jumlah void per nama kasir.
    pool.query(
      `select cashier_name as name,
         count(*) filter (where status = 'paid' and comp_employee_id is null)::int as count,
         coalesce(sum(total) filter (where status = 'paid' and comp_employee_id is null), 0)::int as amount,
         coalesce(sum(discount_amount) filter (where status = 'paid' and comp_employee_id is null), 0)::int as "discountAmount",
         count(*) filter (where status = 'paid' and comp_employee_id is not null)::int as "compCount",
         count(*) filter (where status = 'void')::int as "voidCount"
       from orders where business_date between $1 and $2 group by 1 order by amount desc`,
      range,
    ),
    pool.query(
      `select coalesce(sum(oi.qty), 0)::int as "itemCount"
       from order_items oi join orders o on o.id = oi.order_id
       where o.business_date between $1 and $2 and o.status = 'paid' and o.comp_employee_id is null`,
      range,
    ),
    pool.query(
      `select o.id, o.number, o.created_at as "createdAt", o.total, o.payment_method as method, o.cashier_name as "cashierName",
         o.status, o.customer_name as "customerName", o.order_type as "orderType", o.table_name as "tableName", o.comp_employee_name as "compName",
         (select coalesce(sum(qty), 0)::int from order_items where order_id = o.id) as "itemCount"
       from orders o where o.business_date between $1 and $2 order by o.created_at desc limit 8`,
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
    byCashier: byCashier.rows,
    itemCount: items.rows[0].itemCount,
    recentOrders: recent.rows.map((r) => ({ ...r, methodLabel: PAYMENT_LABEL[r.method as PaymentMethod], orderTypeLabel: ORDER_TYPE_LABEL[r.orderType as OrderType] })),
  });
});

/** Analisa menu: popularitas x margin per porsi untuk semua menu aktif (HPP dari resep dasar saat ini). */
reportsRouter.get('/reports/menu-matrix', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const { rows } = await pool.query<MenuSalesRow>(
    `select p.id as "productId", p.name, coalesce(c.name, 'Lainnya') as category, p.price,
       coalesce(s.qty, 0)::int as qty, coalesce(s.amount, 0)::int as amount,
       coalesce(r.cost, 0)::float8 as cost, coalesce(r.lines, 0)::int as "recipeLines"
     from products p
     left join categories c on c.id = p.category_id
     left join (
       select oi.product_id, sum(oi.qty) as qty, sum(oi.line_total) as amount
       from order_items oi join orders o on o.id = oi.order_id
       where o.business_date between $1 and $2 and o.status = 'paid' and o.comp_employee_id is null group by 1
     ) s on s.product_id = p.id
     left join (
       select ri.product_id, sum(ri.qty * i.cost_per_unit) as cost, count(*) as lines
       from recipe_items ri join ingredients i on i.id = ri.ingredient_id
       where ri.option_id is null group by 1
     ) r on r.product_id = p.id
     where p.active`,
    [q.from, q.to],
  );
  res.json(analyzeMenu(rows));
});

/** Komplimen karyawan: siapa mengambil apa, nilai jual dan HPP-nya, serta hari yang melebihi jatah. */
reportsRouter.get('/reports/comps', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const settings = await getSettings(pool);
  const perDay = settings.comp?.perDay ?? 1;
  const range = [q.from, q.to];
  const where = "o.business_date between $1 and $2 and o.status = 'paid' and o.comp_employee_id is not null";
  const [orders, items, cost] = await Promise.all([
    pool.query(
      `select o.id, o.number, o.created_at as at, o.business_date as "businessDate", o.cashier_name as "cashierName",
         o.comp_employee_id as "employeeId", o.comp_employee_name as "employeeName", o.comp_approved_by is not null as approved,
         o.subtotal as value, coalesce(sum(oi.qty), 0)::int as qty,
         string_agg(oi.qty || 'x ' || oi.name, ', ' order by oi.sort) as items
       from orders o join order_items oi on oi.order_id = o.id where ${where}
       group by o.id order by o.created_at desc limit 500`,
      range,
    ),
    pool.query(
      `select o.comp_employee_id as "employeeId", o.comp_employee_name as "employeeName", oi.name, sum(oi.qty)::int as qty, sum(oi.line_total)::int as value
       from orders o join order_items oi on oi.order_id = o.id where ${where}
       group by 1, 2, 3 order by 2, qty desc`,
      range,
    ),
    pool.query(
      `select coalesce(-sum(m.qty * m.unit_cost), 0)::float8 as cost
       from stock_movements m join orders o on o.id = m.ref_id
       where m.ref_type = 'order' and m.type in ('sale', 'void') and ${where}`,
      range,
    ),
  ]);
  // Jatah dihitung per karyawan per hari usaha. Hanya pengambilan yang membuat total hari itu
  // melewati jatah yang ditandai (pengambilan pertama yang masih dalam jatah tetap "sesuai").
  const perDayQty = new Map<string, number>();
  const over = new Set<string>();
  for (const o of [...orders.rows].reverse()) {
    const key = `${o.employeeId}|${o.businessDate}`;
    const total = (perDayQty.get(key) ?? 0) + o.qty;
    perDayQty.set(key, total);
    if (total > perDay) over.add(o.id);
  }
  const byEmployee = new Map<string, { employeeId: string; name: string; orders: number; qty: number; value: number; days: Set<string>; overDays: number; items: { name: string; qty: number; value: number }[] }>();
  for (const o of orders.rows) {
    const e = byEmployee.get(o.employeeId) ?? { employeeId: o.employeeId, name: o.employeeName, orders: 0, qty: 0, value: 0, days: new Set<string>(), overDays: 0, items: [] };
    e.orders++;
    e.qty += o.qty;
    e.value += o.value;
    e.days.add(o.businessDate);
    byEmployee.set(o.employeeId, e);
  }
  for (const [key, qty] of perDayQty) if (qty > perDay) byEmployee.get(key.split('|')[0])!.overDays++;
  for (const i of items.rows) byEmployee.get(i.employeeId)?.items.push({ name: i.name, qty: i.qty, value: i.value });
  res.json({
    perDay,
    enabled: settings.comp?.enabled ?? true,
    totals: { orders: orders.rows.length, qty: orders.rows.reduce((n, o) => n + o.qty, 0), value: orders.rows.reduce((n, o) => n + o.value, 0), cost: Math.round(cost.rows[0].cost) },
    byEmployee: [...byEmployee.values()].map((e) => ({ ...e, days: e.days.size })).sort((a, b) => b.qty - a.qty),
    list: orders.rows.map((o) => ({ ...o, overQuota: over.has(o.id) })),
  });
});

/**
 * Selisih bahan: pemakaian tercatat (penjualan + komplimen, menurut resep), terbuang yang dicatat,
 * dan selisih opname (hitung fisik - sistem) per bahan, dinilai terhadap toleransi.
 */
reportsRouter.get('/reports/stock-variance', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const settings = await getSettings(pool);
  const { rows } = await pool.query<VarianceInput>(
    `select i.id as "ingredientId", i.name, i.unit, i.station, i.cost_per_unit as "costPerUnit", i.tolerance_pct as "tolerancePct",
       coalesce(u.sold, 0)::float8 as "soldQty", coalesce(u.comp, 0)::float8 as "compQty", coalesce(u.waste, 0)::float8 as "wasteQty",
       coalesce(op.diff, 0)::float8 as "opnameDiff", coalesce(op.n, 0)::int as "opnameCount"
     from ingredients i
     left join (
       select m.ingredient_id,
         -sum(m.qty) filter (where m.type in ('sale', 'void') and o.comp_employee_id is null) as sold,
         -sum(m.qty) filter (where m.type in ('sale', 'void') and o.comp_employee_id is not null) as comp,
         -sum(m.qty) filter (where m.type = 'waste') as waste
       from stock_movements m left join orders o on m.ref_type = 'order' and o.id = m.ref_id
       where (m.created_at at time zone $3)::date between $1 and $2
       group by 1
     ) u on u.ingredient_id = i.id
     left join (
       select oi.ingredient_id, sum(oi.diff) as diff, count(*) as n
       from opname_items oi join opnames o on o.id = oi.opname_id
       where o.business_date between $1 and $2 group by 1
     ) op on op.ingredient_id = i.id
     where i.active`,
    [q.from, q.to, settings.store.timezone],
  );
  res.json(analyzeVariance(rows, settings.stock?.tolerancePct ?? 3));
});

/** Denyut bulan berjalan: capaian terhadap target penjualan + tren 14 hari (penjualan bersih = subtotal - diskon). */
reportsRouter.get('/reports/pulse', need('admin'), async (_req, res) => {
  const settings = await getSettings(pool);
  const today = businessDate(new Date().toISOString(), settings.store.timezone);
  const monthFrom = `${today.slice(0, 8)}01`;
  const [y, m] = today.split('-').map(Number);
  const { rows } = await pool.query<{ date: string; count: number; revenue: number }>(
    `select business_date as date, count(*)::int as count, coalesce(sum(subtotal - discount_amount), 0)::int as revenue
     from orders where status = 'paid' and business_date between least($1::date, $2::date - 13) and $2 group by 1 order by 1`,
    [monthFrom, today],
  );
  // Pola keramaian 4 minggu terakhir (hari x jam), tidak bergantung pada filter dashboard.
  const heatmap = await pool.query(
    `select extract(isodow from created_at at time zone $2)::int as dow, extract(hour from created_at at time zone $2)::int as hour,
       count(*)::int as count, sum(total)::int as amount
     from orders where status = 'paid' and business_date between $1::date - 27 and $1::date group by 1, 2`,
    [today, settings.store.timezone],
  );
  const month = rows.filter((r) => r.date >= monthFrom);
  res.json({
    today,
    monthFrom,
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    dayOfMonth: Number(today.slice(8)),
    monthRevenue: month.reduce((n, r) => n + r.revenue, 0),
    monthOrders: month.reduce((n, r) => n + r.count, 0),
    target: settings.goals?.monthlySales ?? 0,
    last14: rows.filter((r) => r.date >= addDaysIso(today, -13)),
    heatmap: heatmap.rows,
  });
});

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
