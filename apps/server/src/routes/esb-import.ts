// Impor penjualan dari ekspor Excel ESB (POS lama), khusus owner dari HP/laptop. Berkas dibaca di browser; server
// menerima data transaksinya, menyusun ulang rincian menu per transaksi dari laporan menu harian (allocateDay),
// lalu menyimpannya sebagai transaksi bertanda source='esb'. Impor ulang aman: ID transaksi diturunkan dari nomor
// transaksi ESB. Stok bahan tidak dipotong (bahan untuk penjualan itu sudah terpakai sebelum Mourden dipakai); HPP-nya
// dicatat sebagai perkiraan (orders.cogs_estimate) dari resep menu yang dicocokkan x harga bahan, untuk laba kotor.
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { allocateDay, esbMenuKey, esbPaymentMethod, localToUtcIso, suggestProduct, type DayAllocation, type EsbMenuLine, type EsbTransaction } from '@mourden/shared';
import { need } from '../auth';
import { audit, pool, tx, type Db } from '../db';
import { forbidden, parse } from '../http';
import { getTimezone } from '../repo';

export const esbImportRouter = Router();

const MAP_KEY = 'esb_menu_map';
/** Pilihan pemetaan: buat menu baru di POS (kategori = sub kategori ESB, harga = harga per porsi ESB). */
export const NEW_PRODUCT = 'new';
export const ESB_CASHIER = 'Impor ESB';

function ownerOnline(req: { auth: { device?: unknown; verified?: boolean; user?: { role: string } | null } }) {
  if (req.auth.device || !req.auth.verified || req.auth.user?.role !== 'owner') throw forbidden('Hanya owner dari HP/laptop yang login online');
}

/** UUID tetap dari teks (bentuk v5), supaya impor ulang menghasilkan ID yang sama. */
function stableUuid(text: string): string {
  const h = createHash('sha1').update(text).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const text = (max: number) => z.string().max(max);

const transaction = z.object({
  ref: z.string().min(1).max(60),
  bill: z.string().min(1).max(60),
  date: isoDate,
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  orderType: z.enum(['dine_in', 'take_away']),
  table: text(60),
  method: text(60),
  salesType: text(40),
  subtotal: amount,
  discount: amount,
  service: amount,
  tax: amount,
  otherFees: amount,
  rounding: amount,
  total: amount,
});

const menuLine = z.object({
  name: z.string().min(1).max(120),
  category: text(80),
  sub: text(80),
  qty: z.number().int().min(1).max(100_000),
  bills: z.number().int().min(1).max(100_000),
  amount: amount,
});

const body = z.object({
  transactions: z.array(transaction).min(1).max(5_000),
  menuDays: z.array(z.object({ date: isoDate, lines: z.array(menuLine).max(1_000) })).max(400),
  /** kunci menu ESB -> id menu Mourden; '' = simpan dengan nama ESB saja; 'new' = jadikan menu baru di POS. */
  mapping: z.record(z.string().max(250), z.union([z.uuid(), z.literal(''), z.literal(NEW_PRODUCT)])).optional(),
  /** Tanggal yang diimpor (hanya untuk POST /admin/import/esb). */
  dates: z.array(isoDate).max(400).optional(),
});
type Body = z.infer<typeof body>;

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
}

async function products(db: Db): Promise<Product[]> {
  const { rows } = await db.query<Product>(
    `select p.id, p.name, c.name as category, p.price from products p join categories c on c.id = p.category_id
     where p.deleted_at is null order by c.sort, c.name, p.sort, p.name`,
  );
  return rows;
}

async function savedMap(db: Db): Promise<Record<string, string>> {
  const { rows } = await db.query<{ value: Record<string, string> }>('select value from settings where key = $1', [MAP_KEY]);
  return rows[0]?.value ?? {};
}

const isSale = (t: EsbTransaction) => /^(sales|sale|penjualan)$/i.test(t.salesType.trim());
const balanced = (t: EsbTransaction) => t.subtotal - t.discount + t.service + t.tax + t.otherFees + t.rounding === t.total;

interface DayPlan {
  date: string;
  bills: EsbTransaction[];
  allocation: DayAllocation;
  hasMenu: boolean;
  menuAmount: number;
  skipped: { ref: string; bill: string; reason: string }[];
}

function plan(b: Body): DayPlan[] {
  const byDate = new Map<string, EsbTransaction[]>();
  // Berkas detail yang sama bisa dipilih dua kali: ambil satu per nomor transaksi.
  const seen = new Set<string>();
  for (const t of b.transactions) {
    if (seen.has(t.ref)) continue;
    seen.add(t.ref);
    byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  }
  const menus = new Map(b.menuDays.map((d) => [d.date, d.lines]));
  return [...byDate.keys()].sort().map((date) => {
    const all = byDate.get(date)!;
    const skipped: DayPlan['skipped'] = [];
    const bills = all.filter((t) => {
      if (!isSale(t)) skipped.push({ ref: t.ref, bill: t.bill, reason: `Jenis "${t.salesType}" bukan penjualan` });
      else if (t.otherFees) skipped.push({ ref: t.ref, bill: t.bill, reason: 'Ada biaya pengiriman/pemesanan (belum didukung)' });
      else if (!balanced(t)) skipped.push({ ref: t.ref, bill: t.bill, reason: 'Angka transaksi tidak seimbang' });
      else return true;
      return false;
    });
    const lines: EsbMenuLine[] = menus.get(date) ?? [];
    // Target penyusunan = subtotal sebelum diskon (laporan menu ESB memakai harga jual menu).
    const allocation = allocateDay(bills.map((t) => ({ ref: t.ref, subtotal: t.subtotal })), lines);
    return { date, bills, allocation, hasMenu: menus.has(date), menuAmount: lines.reduce((n, l) => n + l.amount, 0), skipped };
  });
}

async function existing(db: Db, refs: string[], dates: string[]) {
  const [imported, pos] = await Promise.all([
    db.query<{ ref: string }>("select external_ref as ref from orders where source = 'esb' and external_ref = any($1::text[])", [refs]),
    db.query<{ date: string; count: number; total: number }>(
      `select to_char(business_date, 'YYYY-MM-DD') as date, count(*)::int as count, coalesce(sum(total), 0)::int as total
       from orders where source = 'pos' and status = 'paid' and business_date = any($1::date[]) group by 1`,
      [dates],
    ),
  ]);
  return { imported: new Set(imported.rows.map((r) => r.ref)), pos: new Map(pos.rows.map((r) => [r.date, r])) };
}

/** Pratinjau: ringkasan per tanggal, kecocokan menu, dan saran pemetaan menu ESB ke menu Mourden. */
esbImportRouter.post('/admin/import/esb/preview', need('admin'), async (req, res) => {
  ownerOnline(req);
  const b = parse(body, req.body);
  const days = plan(b);
  const [catalog, saved, ex] = await Promise.all([
    products(pool),
    savedMap(pool),
    existing(pool, b.transactions.map((t) => t.ref), days.map((d) => d.date)),
  ]);
  const ids = new Set(catalog.map((p) => p.id));

  const menus = new Map<string, { key: string; name: string; category: string; sub: string; qty: number; amount: number }>();
  for (const d of b.menuDays) {
    for (const l of d.lines) {
      if (l.amount <= 0) continue;
      const key = esbMenuKey(l);
      const m = menus.get(key) ?? { key, name: l.name, category: l.category, sub: l.sub, qty: 0, amount: 0 };
      m.qty += l.qty;
      m.amount += l.amount;
      menus.set(key, m);
    }
  }

  res.json({
    days: days.map((d) => {
      const fresh = d.bills.filter((t) => !ex.imported.has(t.ref));
      const methods: Record<string, { count: number; amount: number }> = {};
      for (const t of d.bills) {
        const m = esbPaymentMethod(t.method);
        methods[m] = { count: (methods[m]?.count ?? 0) + 1, amount: (methods[m]?.amount ?? 0) + t.total };
      }
      return {
        date: d.date,
        bills: d.bills.length,
        newBills: fresh.length,
        alreadyImported: d.bills.length - fresh.length,
        subtotal: d.bills.reduce((n, t) => n + t.subtotal, 0),
        discount: d.bills.reduce((n, t) => n + t.discount, 0),
        service: d.bills.reduce((n, t) => n + t.service, 0),
        total: d.bills.reduce((n, t) => n + t.total, 0),
        methods,
        hasMenu: d.hasMenu,
        menuAmount: d.menuAmount,
        exact: d.hasMenu && d.allocation.exact,
        leftover: d.allocation.leftover,
        skippedFree: d.allocation.skippedFree,
        skipped: d.skipped,
        pos: ex.pos.get(d.date) ?? { count: 0, total: 0 },
      };
    }),
    methods: [...new Set(b.transactions.map((t) => t.method))].map((name) => ({ name, method: esbPaymentMethod(name) })),
    menus: [...menus.values()]
      .sort((a, b2) => b2.qty - a.qty || a.name.localeCompare(b2.name))
      .map((m) => {
        const remembered = saved[m.key];
        if (remembered !== undefined && (remembered === '' || ids.has(remembered))) return { ...m, productId: remembered, source: 'saved' as const };
        const guess = suggestProduct(m.name, catalog, m.amount / m.qty);
        if (guess) return { ...m, productId: guess.id, source: 'name' as const };
        // Nama sama tetapi harganya jauh berbeda (mis. ukuran 1 Liter): sarankan sebagai menu baru.
        if (suggestProduct(m.name, catalog)) return { ...m, productId: NEW_PRODUCT, source: 'size' as const };
        return { ...m, productId: '', source: null };
      }),
    products: catalog,
  });
});

/** Simpan transaksi ESB untuk tanggal terpilih. Transaksi yang sudah pernah diimpor dilewati. */
/**
 * HPP perkiraan transaksi ESB pada rentang tanggal: resep menu yang dicocokkan x harga bahan saat ini (sama seperti
 * pemotongan stok penjualan tablet, tetapi stok tidak diubah). Menu yang belum punya resep bernilai 0.
 */
async function recostEsb(c: Db, from: string, to: string) {
  await c.query(
    `update orders o set cogs_estimate = coalesce((
       select sum(ri.qty * oi.qty * i.cost_per_unit)
       from order_items oi
       join recipe_items ri on ri.product_id = oi.product_id
         and (ri.option_id is null or exists (select 1 from jsonb_array_elements(oi.options) e where e->>'optionId' = ri.option_id::text))
       join ingredients i on i.id = ri.ingredient_id
       where oi.order_id = o.id
     ), 0)
     where o.source = 'esb' and o.business_date between $1 and $2`,
    [from, to],
  );
  const { rows } = await c.query<{ cogs: number }>(
    "select coalesce(sum(cogs_estimate), 0)::float8 as cogs from orders where source = 'esb' and status = 'paid' and business_date between $1 and $2",
    [from, to],
  );
  return Math.round(rows[0].cogs);
}

esbImportRouter.post('/admin/import/esb', need('admin'), async (req, res) => {
  ownerOnline(req);
  const b = parse(body, req.body);
  const selected = new Set(b.dates ?? []);
  const days = plan(b).filter((d) => selected.has(d.date));
  const tz = await getTimezone(pool);
  const userId = req.auth.user!.id;

  const result = await tx(async (c) => {
    const catalog = new Map((await products(c)).map((p) => [p.id, p]));
    const mapping = { ...(await savedMap(c)), ...(b.mapping ?? {}) };
    const created = await createProducts(c, b, mapping, catalog, userId);
    // Ingat pemetaan menu supaya impor berikutnya langsung terisi.
    await c.query(
      `insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [MAP_KEY, JSON.stringify(mapping)],
    );
    const taken = new Set(
      (await c.query<{ number: string }>('select number from orders where number = any($1::text[])', [days.flatMap((d) => d.bills.map((t) => t.bill))])).rows.map((r) => r.number),
    );
    let inserted = 0;
    let skipped = 0;
    let items = 0;
    let total = 0;
    for (const d of days) {
      for (const t of d.bills) {
        const id = stableUuid(`esb:${t.ref}`);
        const method = esbPaymentMethod(t.method);
        const net = t.subtotal - t.discount;
        const { rowCount } = await c.query(
          `insert into orders (
             id, number, device_id, shift_id, cashier_id, cashier_name, created_at, business_date, customer_name,
             discount, subtotal, discount_amount, service_pct, service_amount, tax_pct, tax_label, tax_amount,
             rounding_amount, total, payment_method, payment_amount, tendered, change, payment_reference, order_type, table_name, pax,
             source, external_ref
           ) values ($1,$2,null,null,null,$3,$4,$5,'',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,0,$18,$19,$20,0,'esb',$21)
           on conflict do nothing`,
          [
            id,
            taken.has(t.bill) ? `ESB-${t.bill}` : t.bill,
            ESB_CASHIER,
            localToUtcIso(t.paidAt, tz),
            t.date,
            t.discount > 0 ? JSON.stringify({ type: 'amount', value: t.discount, reason: 'Diskon dari ESB' }) : null,
            t.subtotal,
            t.discount,
            net > 0 ? Math.round((t.service / net) * 10_000) / 100 : 0,
            t.service,
            net > 0 ? Math.round((t.tax / net) * 10_000) / 100 : 0,
            t.tax ? 'Pajak' : '',
            t.tax,
            t.rounding,
            t.total,
            method,
            t.total,
            `ESB ${t.ref}`,
            t.orderType,
            t.table,
            t.ref,
          ],
        );
        if (!rowCount) {
          skipped++;
          continue;
        }
        const lines = d.allocation.byBill[t.ref] ?? [];
        for (const [i, l] of lines.entries()) {
          const target = l.key ? mapping[l.key] : '';
          const product = target ? catalog.get(target) : undefined;
          await c.query(
            `insert into order_items (id, order_id, product_id, name, base_price, unit_price, qty, options, note, line_total, sort)
             values ($1,$2,$3,$4,$5,$5,$6,'[]','',$7,$8)`,
            [stableUuid(`esb:${t.ref}:${i}`), id, product?.id ?? null, product?.name ?? l.name, l.unitPrice, l.qty, l.unitPrice * l.qty, i],
          );
          items += l.qty;
        }
        inserted++;
        total += t.total;
      }
    }
    const dates = days.map((d) => d.date).sort();
    const cogs = dates.length ? await recostEsb(c, dates[0], dates[dates.length - 1]) : 0;
    await audit(c, userId, 'import', 'esb-sales', null, { dates, inserted, skipped, total, cogs });
    return { inserted, skipped, items, total, created, cogs };
  });
  res.json(result);
});

/**
 * Menu ESB yang dipilih "jadikan menu baru": dibuat di kategori bernama sub kategori ESB (dibuat bila belum ada),
 * harga = harga per porsi ESB. Nama diberi ukuran bila sudah dipakai menu lain, mis. "Americano (1 Liter)".
 * Pemetaan diganti dengan ID menu barunya supaya impor berikutnya langsung memakai menu itu.
 */
async function createProducts(c: Db, b: Body, mapping: Record<string, string>, catalog: Map<string, Product>, userId: string) {
  const lines = new Map<string, { name: string; category: string; sub: string; qty: number; amount: number }>();
  for (const d of b.menuDays) {
    for (const l of d.lines) {
      const key = esbMenuKey(l);
      if (mapping[key] !== NEW_PRODUCT || l.amount <= 0) continue;
      const x = lines.get(key) ?? { name: l.name, category: l.category, sub: l.sub, qty: 0, amount: 0 };
      x.qty += l.qty;
      x.amount += l.amount;
      lines.set(key, x);
    }
  }
  const created: { name: string; category: string; price: number }[] = [];
  const names = new Set([...catalog.values()].map((p) => p.name.trim().toLowerCase()));
  for (const [key, l] of lines) {
    const categoryName = (l.sub || l.category || 'Lainnya').trim().slice(0, 60);
    let categoryId = (await c.query<{ id: string }>('select id from categories where deleted_at is null and lower(name) = lower($1) order by sort, name limit 1', [categoryName])).rows[0]?.id;
    if (!categoryId) {
      const sort = (await c.query<{ n: number }>('select coalesce(max(sort), 0)::int + 1 as n from categories')).rows[0].n;
      categoryId = (await c.query<{ id: string }>('insert into categories (name, sort, active) values ($1, $2, true) returning id', [categoryName, sort])).rows[0].id;
      await audit(c, userId, 'create', 'category', categoryId, { name: categoryName, from: 'esb-import' });
    }
    const base = l.name.trim().slice(0, 80);
    const name = names.has(base.toLowerCase()) && !base.toLowerCase().includes(categoryName.toLowerCase()) ? `${base} (${categoryName})` : base;
    const price = Math.round(l.amount / l.qty);
    const id = (await c.query<{ id: string }>(`insert into products (category_id, name, sku, price, active, sold_out, sort) values ($1, $2, '', $3, true, false, 0) returning id`, [categoryId, name, price])).rows[0].id;
    await audit(c, userId, 'create', 'product', id, { name, price, categoryName, from: 'esb-import' });
    catalog.set(id, { id, name, category: categoryName, price });
    names.add(name.toLowerCase());
    mapping[key] = id;
    created.push({ name, category: categoryName, price });
  }
  // Pilihan "baru" yang tidak punya baris terjual (harga tidak diketahui) disimpan sebagai nama ESB saja.
  for (const k of Object.keys(mapping)) if (mapping[k] === NEW_PRODUCT) mapping[k] = '';
  return created;
}

/** Data impor ESB yang tersimpan, per tanggal (dengan HPP perkiraan), plus menu terjual yang belum punya resep. */
esbImportRouter.get('/admin/import/esb', need('admin'), async (req, res) => {
  ownerOnline(req);
  const [days, missing] = await Promise.all([
    pool.query(
      `select to_char(business_date, 'YYYY-MM-DD') as date, count(*)::int as count, coalesce(sum(total), 0)::int as total,
         coalesce(sum(subtotal - discount_amount), 0)::int as revenue, round(coalesce(sum(cogs_estimate), 0))::int as cogs
       from orders where source = 'esb' and status = 'paid' group by 1 order by 1 desc limit 400`,
    ),
    pool.query(
      `select coalesce(p.name, oi.name) as name, sum(oi.qty)::int as qty, oi.product_id is null as unmatched
       from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id
       where o.source = 'esb' and o.status = 'paid'
         and (oi.product_id is null or not exists (select 1 from recipe_items ri where ri.product_id = oi.product_id))
       group by 1, 3 order by qty desc limit 100`,
    ),
  ]);
  res.json({ days: days.rows, missingRecipes: missing.rows });
});

/** Hitung ulang HPP transaksi ESB (mis. setelah resep atau harga bahan dilengkapi). */
esbImportRouter.post('/admin/import/esb/recost', need('admin'), async (req, res) => {
  ownerOnline(req);
  const b = parse(z.object({ from: isoDate, to: isoDate }), req.body);
  const cogs = await tx(async (c) => {
    const value = await recostEsb(c, b.from, b.to);
    await audit(c, req.auth.user!.id, 'recost', 'esb-sales', null, { ...b, cogs: value });
    return value;
  });
  res.json({ cogs });
});

/** Hapus transaksi hasil impor ESB pada rentang tanggal (mis. salah impor); bisa diimpor ulang kapan saja. */
esbImportRouter.post('/admin/import/esb/delete', need('admin'), async (req, res) => {
  ownerOnline(req);
  const b = parse(z.object({ from: isoDate, to: isoDate }), req.body);
  const removed = await tx(async (c) => {
    const { rows } = await c.query<{ count: number; total: number }>(
      "select count(*)::int as count, coalesce(sum(total), 0)::int as total from orders where source = 'esb' and business_date between $1 and $2",
      [b.from, b.to],
    );
    await c.query("delete from orders where source = 'esb' and business_date between $1 and $2", [b.from, b.to]);
    await audit(c, req.auth.user!.id, 'delete', 'esb-sales', null, { ...b, ...rows[0] });
    return rows[0];
  });
  res.json(removed);
});
