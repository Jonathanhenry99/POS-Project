// Bahan baku, pergerakan stok (masuk/terbuang/koreksi), dan stock opname harian.
import { Router } from 'express';
import { z } from 'zod';
import { businessDate, can } from '@mourden/shared';
import { need } from '../auth';
import { audit, pool, tx } from '../db';
import { badRequest, dateRangeQuery, forbidden, notFound, parse } from '../http';
import { getIngredients, getStockLevels, getTimezone, round3 } from '../repo';

export const inventoryRouter = Router();

const uuid = z.uuid();
const station = z.enum(['bar', 'kitchen', 'umum']);

/** Daftar bahan + stok. Owner melihat semua; barista/kitchen juga boleh (untuk mencatat barang masuk/terbuang). */
inventoryRouter.get('/ingredients', need('stock.record'), async (req, res) => {
  const q = parse(z.object({ station: station.optional(), all: z.enum(['1']).optional() }), req.query);
  if (q.all) {
    if (!can(req.auth.user!.role, 'admin')) throw forbidden();
    res.json(await getIngredients(pool, true));
    return;
  }
  res.json(await getStockLevels(pool, { station: q.station }));
});

const ingredientBody = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(12),
  station,
  minStock: z.number().min(0).max(1e9),
  costPerUnit: z.number().min(0).max(1e9),
  active: z.boolean().default(true),
  /** Stok awal saat bahan dibuat (dicatat sebagai koreksi). */
  initialStock: z.number().min(0).max(1e9).optional(),
});

inventoryRouter.post('/ingredients', need('admin'), async (req, res) => {
  const b = parse(ingredientBody, req.body);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      'insert into ingredients (name, unit, station, min_stock, cost_per_unit, active) values ($1,$2,$3,$4,$5,$6) returning id',
      [b.name, b.unit, b.station, b.minStock, b.costPerUnit, b.active],
    );
    if (b.initialStock) {
      await c.query(
        "insert into stock_movements (ingredient_id, qty, type, unit_cost, note, user_id) values ($1, $2, 'adjust', $3, 'Stok awal', $4)",
        [rows[0].id, b.initialStock, b.costPerUnit, req.auth.user!.id],
      );
    }
    await audit(c, req.auth.user!.id, 'create', 'ingredient', rows[0].id, b);
    return rows[0].id as string;
  });
  res.status(201).json({ id });
});

inventoryRouter.patch('/ingredients/:id', need('admin'), async (req, res) => {
  const b = parse(ingredientBody.omit({ initialStock: true }).partial(), req.body);
  const cols: Record<string, string> = { name: 'name', unit: 'unit', station: 'station', minStock: 'min_stock', costPerUnit: 'cost_per_unit', active: 'active' };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(cols)) {
    const v = (b as Record<string, unknown>)[k];
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  vals.push(req.params.id);
  const { rowCount } = await pool.query(`update ingredients set ${[...sets, 'updated_at = now()'].join(', ')} where id = $${vals.length}`, vals);
  if (!rowCount) throw notFound();
  await audit(pool, req.auth.user!.id, 'update', 'ingredient', String(req.params.id), b);
  res.json({ ok: true });
});

// ---------- Pergerakan stok manual ----------

const movementBody = z.object({
  id: uuid.optional(),
  ingredientId: uuid,
  type: z.enum(['purchase', 'waste', 'adjust']),
  /** Jumlah selalu positif; tanda +/- ditentukan oleh jenis (adjust boleh negatif). */
  qty: z.number().refine((n) => n !== 0, 'Jumlah tidak boleh 0'),
  /** Total harga beli (untuk barang masuk); dipakai memperbarui harga per satuan. */
  totalCost: z.number().min(0).optional(),
  note: z.string().max(200).default(''),
});

inventoryRouter.post('/stock/movements', need('stock.record'), async (req, res) => {
  const b = parse(movementBody, req.body);
  const user = req.auth.user!;
  if (b.type === 'adjust' && !can(user.role, 'admin')) throw forbidden('Koreksi stok hanya untuk owner');
  if (b.type !== 'adjust' && b.qty < 0) throw badRequest('Jumlah harus positif');
  const qty = b.type === 'waste' ? -Math.abs(b.qty) : b.qty;

  const result = await tx(async (c) => {
    if (b.id) {
      const { rowCount } = await c.query('select 1 from stock_movements where id = $1', [b.id]);
      if (rowCount) return 'exists';
    }
    const { rows } = await c.query<{ cost_per_unit: number }>('select cost_per_unit from ingredients where id = $1 for update', [b.ingredientId]);
    if (!rows[0]) throw notFound('Bahan tidak ditemukan');
    let unitCost = rows[0].cost_per_unit;
    if (b.type === 'purchase' && b.totalCost && b.qty > 0) {
      unitCost = b.totalCost / b.qty;
      await c.query('update ingredients set cost_per_unit = $1, updated_at = now() where id = $2', [unitCost, b.ingredientId]);
    }
    await c.query(
      `insert into stock_movements (id, ingredient_id, qty, type, unit_cost, note, user_id)
       values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)`,
      [b.id ?? null, b.ingredientId, qty, b.type, unitCost, b.note, user.id],
    );
    return 'created';
  });
  res.status(result === 'created' ? 201 : 200).json({ ok: true, status: result });
});

inventoryRouter.get('/stock/movements', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery.extend({ ingredientId: uuid.optional(), type: z.string().optional() }), req.query);
  const tz = await getTimezone(pool);
  const params: unknown[] = [q.from, q.to, tz];
  let where = '(m.created_at at time zone $3)::date between $1 and $2';
  if (q.ingredientId) {
    params.push(q.ingredientId);
    where += ` and m.ingredient_id = $${params.length}`;
  }
  if (q.type) {
    params.push(q.type);
    where += ` and m.type = $${params.length}`;
  }
  const { rows } = await pool.query(
    `select m.id, m.ingredient_id as "ingredientId", i.name as "ingredientName", i.unit, m.qty, m.type, m.unit_cost as "unitCost",
       m.ref_type as "refType", m.ref_id as "refId", m.note, u.name as "userName", m.created_at as "createdAt"
     from stock_movements m join ingredients i on i.id = m.ingredient_id left join users u on u.id = m.user_id
     where ${where} order by m.created_at desc limit 1000`,
    params,
  );
  res.json(rows);
});

// ---------- Stock opname ----------

/** Lembar opname: daftar bahan per stasiun beserta stok menurut sistem. */
inventoryRouter.get('/opname/sheet', need('stock.opname'), async (req, res) => {
  const q = parse(z.object({ station }), req.query);
  const tz = await getTimezone(pool);
  const today = businessDate(new Date().toISOString(), tz);
  const [levels, last] = await Promise.all([
    getStockLevels(pool, { station: q.station }),
    pool.query(
      `select id, user_name as "userName", created_at as "createdAt" from opnames
       where station = $1 and business_date = $2 order by created_at desc limit 1`,
      [q.station, today],
    ),
  ]);
  res.json({ station: q.station, businessDate: today, items: levels, doneToday: last.rows[0] ?? null });
});

const opnameBody = z.object({
  station,
  note: z.string().max(300).default(''),
  items: z.array(z.object({ ingredientId: uuid, countedQty: z.number().min(0).max(1e9) })).min(1).max(500),
});

/**
 * Simpan hasil hitung fisik. Selisih (hitung - sistem) dicatat sebagai pergerakan 'opname'
 * sehingga stok sistem kembali sama dengan stok fisik. Idempotent berdasarkan ID dari klien.
 */
inventoryRouter.put('/opname/:id', need('stock.opname'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(opnameBody, req.body);
  const user = req.auth.user!;
  const tz = await getTimezone(pool);
  const result = await tx(async (c) => {
    const { rowCount } = await c.query(
      `insert into opnames (id, station, business_date, user_id, user_name, note) values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do nothing`,
      [id, b.station, businessDate(new Date().toISOString(), tz), user.id, user.name, b.note],
    );
    if (!rowCount) return 'exists';
    // Kunci baris bahan agar penjualan yang masuk bersamaan tidak membuat selisih ganda.
    const ids = b.items.map((i) => i.ingredientId);
    await c.query('select id from ingredients where id = any($1::uuid[]) order by id for update', [ids]);
    const levels = new Map((await getStockLevels(c, { ids })).map((l) => [l.id, l]));
    for (const item of b.items) {
      const level = levels.get(item.ingredientId);
      if (!level) throw badRequest('Bahan tidak ditemukan atau tidak aktif');
      const diff = round3(item.countedQty - level.stock);
      await c.query(
        `insert into opname_items (opname_id, ingredient_id, system_qty, counted_qty, diff, unit_cost) values ($1,$2,$3,$4,$5,$6)`,
        [id, item.ingredientId, level.stock, item.countedQty, diff, level.costPerUnit],
      );
      if (diff !== 0) {
        await c.query(
          `insert into stock_movements (ingredient_id, qty, type, unit_cost, ref_type, ref_id, note, user_id)
           values ($1, $2, 'opname', $3, 'opname', $4, $5, $6)`,
          [item.ingredientId, diff, level.costPerUnit, id, b.note, user.id],
        );
      }
    }
    await audit(c, user.id, 'create', 'opname', id, { station: b.station, count: b.items.length });
    return 'created';
  });
  res.status(result === 'created' ? 201 : 200).json({ ok: true, status: result, ...(await opnameDetail(id)) });
});

async function opnameDetail(id: string) {
  const { rows: head } = await pool.query(
    `select id, station, business_date as "businessDate", user_name as "userName", note, created_at as "createdAt" from opnames where id = $1`,
    [id],
  );
  if (!head[0]) throw notFound();
  const { rows: items } = await pool.query(
    `select oi.ingredient_id as "ingredientId", i.name, i.unit, oi.system_qty as "systemQty", oi.counted_qty as "countedQty",
       oi.diff, (oi.diff * oi.unit_cost)::float8 as "diffValue"
     from opname_items oi join ingredients i on i.id = oi.ingredient_id where oi.opname_id = $1 order by i.name`,
    [id],
  );
  return { opname: head[0], items };
}

inventoryRouter.get('/opname/:id', need('stock.opname'), async (req, res) => {
  res.json(await opnameDetail(parse(uuid, req.params.id)));
});

inventoryRouter.get('/opname', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const { rows } = await pool.query(
    `select o.id, o.station, o.business_date as "businessDate", o.user_name as "userName", o.note, o.created_at as "createdAt",
       count(oi.*)::int as "itemCount",
       count(oi.*) filter (where oi.diff <> 0)::int as "diffCount",
       coalesce(sum(oi.diff * oi.unit_cost), 0)::float8 as "diffValue"
     from opnames o left join opname_items oi on oi.opname_id = o.id
     where o.business_date between $1 and $2
     group by o.id order by o.created_at desc`,
    [q.from, q.to],
  );
  res.json(rows);
});
