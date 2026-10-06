// Manajemen menu: kategori, produk, grup opsi (varian/add-on), dan resep.
import { Router } from 'express';
import { z } from 'zod';
import { need } from '../auth';
import { audit, pool, tx } from '../db';
import { notFound, parse } from '../http';
import { getCatalog } from '../repo';

export const catalogRouter = Router();

const uuid = z.uuid();
const name = z.string().trim().min(1).max(80);

catalogRouter.get('/admin/catalog', need('admin'), async (_req, res) => {
  res.json(await getCatalog(pool, true));
});

/** Membuat SET dinamis dari field yang dikirim saja. */
function updateSet(body: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(columns)) {
    if (body[key] === undefined) continue;
    vals.push(body[key]);
    sets.push(`${col} = $${vals.length}`);
  }
  return { sets, vals };
}

// ---------- Kategori ----------

const categoryBody = z.object({ name, sort: z.number().int().default(0), active: z.boolean().default(true) });

catalogRouter.post('/categories', need('admin'), async (req, res) => {
  const b = parse(categoryBody, req.body);
  const { rows } = await pool.query('insert into categories (name, sort, active) values ($1, $2, $3) returning id, name, sort, active', [
    b.name,
    b.sort,
    b.active,
  ]);
  await audit(pool, req.auth.user!.id, 'create', 'category', rows[0].id, b);
  res.status(201).json(rows[0]);
});

catalogRouter.patch('/categories/:id', need('admin'), async (req, res) => {
  const b = parse(categoryBody.partial(), req.body);
  const { sets, vals } = updateSet(b, { name: 'name', sort: 'sort', active: 'active' });
  vals.push(req.params.id);
  const { rows } = await pool.query(
    `update categories set ${[...sets, 'updated_at = now()'].join(', ')} where id = $${vals.length} returning id, name, sort, active`,
    vals,
  );
  if (!rows[0]) throw notFound();
  await audit(pool, req.auth.user!.id, 'update', 'category', String(req.params.id), b);
  res.json(rows[0]);
});

// ---------- Produk ----------

const productBody = z.object({
  categoryId: uuid,
  name,
  sku: z.string().trim().max(40).default(''),
  price: z.number().int().min(0).max(100_000_000),
  active: z.boolean().default(true),
  soldOut: z.boolean().default(false),
  sort: z.number().int().default(0),
  optionGroupIds: z.array(uuid).max(20).default([]),
});

const productCols = { categoryId: 'category_id', name: 'name', sku: 'sku', price: 'price', active: 'active', soldOut: 'sold_out', sort: 'sort' };

async function setProductGroups(c: import('pg').PoolClient, productId: string, groupIds: string[]) {
  await c.query('delete from product_option_groups where product_id = $1', [productId]);
  for (const [i, g] of groupIds.entries()) {
    await c.query('insert into product_option_groups (product_id, group_id, sort) values ($1, $2, $3)', [productId, g, i]);
  }
}

catalogRouter.post('/products', need('admin'), async (req, res) => {
  const b = parse(productBody, req.body);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `insert into products (category_id, name, sku, price, active, sold_out, sort) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [b.categoryId, b.name, b.sku, b.price, b.active, b.soldOut, b.sort],
    );
    await setProductGroups(c, rows[0].id, b.optionGroupIds);
    await audit(c, req.auth.user!.id, 'create', 'product', rows[0].id, b);
    return rows[0].id as string;
  });
  res.status(201).json({ id });
});

catalogRouter.patch('/products/:id', need('admin'), async (req, res) => {
  const b = parse(productBody.partial(), req.body);
  await tx(async (c) => {
    const { sets, vals } = updateSet(b, productCols);
    vals.push(req.params.id);
    const { rowCount } = await c.query(`update products set ${[...sets, 'updated_at = now()'].join(', ')} where id = $${vals.length}`, vals);
    if (!rowCount) throw notFound();
    if (b.optionGroupIds) await setProductGroups(c, String(req.params.id), b.optionGroupIds);
    await audit(c, req.auth.user!.id, 'update', 'product', String(req.params.id), b);
  });
  res.json({ ok: true });
});

/** Kasir boleh menandai menu habis/tersedia langsung dari layar kasir. */
catalogRouter.post('/products/:id/sold-out', need('pos.sell'), async (req, res) => {
  const b = parse(z.object({ soldOut: z.boolean() }), req.body);
  const { rowCount } = await pool.query('update products set sold_out = $1, updated_at = now() where id = $2', [b.soldOut, req.params.id]);
  if (!rowCount) throw notFound();
  await audit(pool, req.auth.user!.id, b.soldOut ? 'sold-out' : 'available', 'product', String(req.params.id));
  res.json({ ok: true });
});

// ---------- Grup opsi (varian & add-on) ----------

const optionGroupBody = z.object({
  name,
  multi: z.boolean().default(false),
  required: z.boolean().default(false),
  sort: z.number().int().default(0),
  active: z.boolean().default(true),
  options: z
    .array(
      z.object({
        id: uuid.optional(),
        name,
        priceDelta: z.number().int().min(-10_000_000).max(10_000_000).default(0),
        active: z.boolean().default(true),
      }),
    )
    .min(1, 'Minimal satu pilihan')
    .max(50),
});

async function saveOptions(c: import('pg').PoolClient, groupId: string, options: z.infer<typeof optionGroupBody>['options']) {
  const keep: string[] = [];
  for (const [i, o] of options.entries()) {
    if (o.id) {
      await c.query('update options set name = $1, price_delta = $2, active = $3, sort = $4 where id = $5 and group_id = $6', [
        o.name,
        o.priceDelta,
        o.active,
        i,
        o.id,
        groupId,
      ]);
      keep.push(o.id);
    } else {
      const { rows } = await c.query(
        'insert into options (group_id, name, price_delta, active, sort) values ($1,$2,$3,$4,$5) returning id',
        [groupId, o.name, o.priceDelta, o.active, i],
      );
      keep.push(rows[0].id);
    }
  }
  // Opsi yang dihapus dari daftar dinonaktifkan (bukan dihapus) agar riwayat & resep tetap utuh.
  await c.query('update options set active = false where group_id = $1 and not (id = any($2::uuid[]))', [groupId, keep]);
}

catalogRouter.post('/option-groups', need('admin'), async (req, res) => {
  const b = parse(optionGroupBody, req.body);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      'insert into option_groups (name, multi, required, sort, active) values ($1,$2,$3,$4,$5) returning id',
      [b.name, b.multi, b.required, b.sort, b.active],
    );
    await saveOptions(c, rows[0].id, b.options);
    await audit(c, req.auth.user!.id, 'create', 'option_group', rows[0].id, b);
    return rows[0].id as string;
  });
  res.status(201).json({ id });
});

catalogRouter.patch('/option-groups/:id', need('admin'), async (req, res) => {
  const b = parse(optionGroupBody.partial(), req.body);
  await tx(async (c) => {
    const { sets, vals } = updateSet(b, { name: 'name', multi: 'multi', required: 'required', sort: 'sort', active: 'active' });
    vals.push(req.params.id);
    const { rowCount } = await c.query(`update option_groups set ${[...sets, 'updated_at = now()'].join(', ')} where id = $${vals.length}`, vals);
    if (!rowCount) throw notFound();
    if (b.options) await saveOptions(c, String(req.params.id), b.options);
    await audit(c, req.auth.user!.id, 'update', 'option_group', String(req.params.id), b);
  });
  res.json({ ok: true });
});

// ---------- Resep & HPP ----------

/** Ringkasan HPP dasar & margin per produk. */
catalogRouter.get('/recipes', need('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select p.id as "productId", p.name, p.price,
       coalesce(sum(ri.qty * i.cost_per_unit) filter (where ri.option_id is null), 0)::float8 as cost,
       count(ri.id)::int as "lineCount"
     from products p
     left join recipe_items ri on ri.product_id = p.id
     left join ingredients i on i.id = ri.ingredient_id
     where p.active
     group by p.id order by p.name`,
  );
  res.json(
    rows.map((r) => ({
      ...r,
      cost: Math.round(r.cost),
      marginPct: r.price > 0 ? Math.round(((r.price - r.cost) / r.price) * 1000) / 10 : 0,
    })),
  );
});

catalogRouter.get('/recipes/:productId', need('admin'), async (req, res) => {
  const { rows } = await pool.query(
    `select ri.id, ri.option_id as "optionId", ri.ingredient_id as "ingredientId", ri.qty,
       i.name as "ingredientName", i.unit, i.cost_per_unit as "costPerUnit"
     from recipe_items ri join ingredients i on i.id = ri.ingredient_id
     where ri.product_id = $1 order by ri.option_id nulls first, i.name`,
    [req.params.productId],
  );
  res.json(rows);
});

const recipeBody = z.object({
  lines: z
    .array(z.object({ optionId: uuid.nullable(), ingredientId: uuid, qty: z.number().positive().max(1_000_000) }))
    .max(100),
});

catalogRouter.put('/recipes/:productId', need('admin'), async (req, res) => {
  const b = parse(recipeBody, req.body);
  await tx(async (c) => {
    const { rowCount } = await c.query('select 1 from products where id = $1', [req.params.productId]);
    if (!rowCount) throw notFound('Produk tidak ditemukan');
    await c.query('delete from recipe_items where product_id = $1', [req.params.productId]);
    for (const l of b.lines) {
      await c.query('insert into recipe_items (product_id, option_id, ingredient_id, qty) values ($1,$2,$3,$4)', [
        req.params.productId,
        l.optionId,
        l.ingredientId,
        l.qty,
      ]);
    }
    await audit(c, req.auth.user!.id, 'update', 'recipe', String(req.params.productId), b);
  });
  res.json({ ok: true });
});
