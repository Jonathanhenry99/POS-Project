// Query baca yang dipakai bersama oleh beberapa route.
import { mergeSettings, type AppSettings, type Catalog, type Ingredient, type StockLevel } from '@mourden/shared';
import type { Db } from './db';

export async function getSettings(db: Db): Promise<AppSettings> {
  const { rows } = await db.query<{ key: string; value: unknown }>('select key, value from settings');
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  return mergeSettings(raw as Parameters<typeof mergeSettings>[0]);
}

export async function getTimezone(db: Db): Promise<string> {
  return (await getSettings(db)).store.timezone;
}

export async function getCatalog(db: Db, includeInactive = false): Promise<Catalog> {
  const activeOnly = includeInactive ? '' : 'where active';
  const [cats, prods, groups, opts, links] = await Promise.all([
    db.query(`select id, name, sort, active from categories ${activeOnly} order by sort, name`),
    db.query(
      `select id, category_id as "categoryId", name, sku, price, active, sold_out as "soldOut", sort
       from products ${activeOnly} order by sort, name`,
    ),
    db.query(`select id, name, multi, required, sort from option_groups ${activeOnly} order by sort, name`),
    db.query(
      `select id, group_id as "groupId", name, price_delta as "priceDelta", active, sort
       from options ${activeOnly} order by sort, name`,
    ),
    db.query<{ product_id: string; group_id: string }>('select product_id, group_id from product_option_groups order by sort'),
  ]);
  const groupIdsByProduct = new Map<string, string[]>();
  for (const l of links.rows) {
    const list = groupIdsByProduct.get(l.product_id) ?? [];
    list.push(l.group_id);
    groupIdsByProduct.set(l.product_id, list);
  }
  const groupIds = new Set(groups.rows.map((g) => g.id));
  return {
    categories: cats.rows,
    products: prods.rows.map((p) => ({ ...p, optionGroupIds: (groupIdsByProduct.get(p.id) ?? []).filter((g) => groupIds.has(g)) })),
    optionGroups: groups.rows.map((g) => ({ ...g, options: opts.rows.filter((o) => o.groupId === g.id) })),
  };
}

const ingredientCols = `i.id, i.name, i.unit, i.station, i.min_stock as "minStock", i.cost_per_unit as "costPerUnit", i.active`;

export async function getIngredients(db: Db, includeInactive = false): Promise<Ingredient[]> {
  const { rows } = await db.query(
    `select ${ingredientCols} from ingredients i ${includeInactive ? '' : 'where i.active'} order by i.station, i.name`,
  );
  return rows;
}

/** Stok saat ini, rata-rata pemakaian 7 hari, perkiraan hari habis, dan status. */
export async function getStockLevels(db: Db, opts: { station?: string; ids?: string[] } = {}): Promise<StockLevel[]> {
  const params: unknown[] = [];
  const where = ['i.active'];
  if (opts.station) {
    params.push(opts.station);
    where.push(`i.station = $${params.length}`);
  }
  if (opts.ids) {
    params.push(opts.ids);
    where.push(`i.id = any($${params.length}::uuid[])`);
  }
  const { rows } = await db.query(
    `select ${ingredientCols},
       coalesce(sum(m.qty), 0)::float8 as stock,
       (coalesce(-sum(m.qty) filter (
         where m.type in ('sale', 'void', 'waste') and m.created_at > now() - interval '7 days'
       ), 0) / 7.0)::float8 as "avgDailyUsage"
     from ingredients i
     left join stock_movements m on m.ingredient_id = i.id
     where ${where.join(' and ')}
     group by i.id
     order by i.station, i.name`,
    params,
  );
  return rows.map((r) => {
    const stock = round3(r.stock);
    const avg = Math.max(0, round3(r.avgDailyUsage));
    const daysLeft = avg > 0 ? Math.max(0, Math.round((stock / avg) * 10) / 10) : null;
    const status: StockLevel['status'] =
      stock <= 0 ? 'habis' : stock <= r.minStock || (daysLeft !== null && daysLeft < 2) ? 'menipis' : 'aman';
    return { ...r, stock, avgDailyUsage: avg, daysLeft, status };
  });
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
