// Data awal: akun default + contoh menu, bahan, dan resep. Hanya mengisi tabel yang masih kosong.
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { DEFAULT_SETTINGS, hashPin } from '@mourden/shared';
import { pool } from './db';
import { migrate } from './migrate';

export const DEFAULT_ACCOUNTS = [
  { name: 'Owner', username: 'owner', role: 'owner', pin: '123456' },
  { name: 'Kasir 1', username: 'kasir', role: 'kasir', pin: '1234' },
  { name: 'Barista', username: 'barista', role: 'barista', pin: '1111' },
  { name: 'Kitchen', username: 'kitchen', role: 'kitchen', pin: '2222' },
] as const;

const INGREDIENTS: [name: string, unit: string, station: string, minStock: number, cost: number, stock: number][] = [
  ['Biji Kopi Arabika', 'gr', 'bar', 500, 150, 5000],
  ['Susu Segar', 'ml', 'bar', 2000, 22, 12000],
  ['Oat Milk', 'ml', 'bar', 1000, 45, 3000],
  ['Gula Aren Cair', 'ml', 'bar', 300, 40, 2000],
  ['Sirup Vanila', 'ml', 'bar', 300, 90, 1500],
  ['Sirup Karamel', 'ml', 'bar', 300, 90, 1500],
  ['Bubuk Coklat', 'gr', 'bar', 200, 120, 1000],
  ['Bubuk Matcha', 'gr', 'bar', 150, 350, 800],
  ['Teh Celup', 'pcs', 'bar', 20, 600, 100],
  ['Lemon', 'pcs', 'bar', 10, 3000, 30],
  ['Whipped Cream', 'ml', 'bar', 500, 50, 2000],
  ['Cup Plastik 16oz', 'pcs', 'bar', 50, 900, 300],
  ['Air Mineral Botol', 'pcs', 'bar', 12, 3000, 48],
  ['Croissant Beku', 'pcs', 'kitchen', 10, 8000, 25],
  ['Roti Tawar', 'lembar', 'kitchen', 20, 1500, 60],
  ['Dada Ayam', 'gr', 'kitchen', 500, 65, 3000],
  ['Keju Slice', 'pcs', 'kitchen', 15, 3500, 50],
  ['Kentang Beku', 'gr', 'kitchen', 1000, 30, 5000],
  ['Cheesecake Slice', 'pcs', 'kitchen', 4, 15000, 12],
];

type Opt = { name: string; price: number };
const GROUPS: { key: string; name: string; multi: boolean; required: boolean; options: Opt[] }[] = [
  { key: 'size', name: 'Ukuran', multi: false, required: true, options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 5000 }] },
  { key: 'temp', name: 'Suhu', multi: false, required: true, options: [{ name: 'Iced', price: 0 }, { name: 'Hot', price: 0 }] },
  { key: 'sugar', name: 'Gula', multi: false, required: false, options: [{ name: 'Normal Sugar', price: 0 }, { name: 'Less Sugar', price: 0 }, { name: 'No Sugar', price: 0 }] },
  {
    key: 'addon',
    name: 'Tambahan',
    multi: true,
    required: false,
    options: [{ name: 'Extra Shot', price: 6000 }, { name: 'Oat Milk', price: 8000 }, { name: 'Whipped Cream', price: 5000 }],
  },
];

// [kategori, nama, harga, grup opsi, resep dasar [bahan, qty]]
const PRODUCTS: [string, string, number, string[], [string, number][]][] = [
  ['Kopi', 'Espresso', 22000, ['temp', 'addon'], [['Biji Kopi Arabika', 18]]],
  ['Kopi', 'Americano', 25000, ['size', 'temp', 'sugar', 'addon'], [['Biji Kopi Arabika', 18], ['Cup Plastik 16oz', 1]]],
  ['Kopi', 'Cappuccino', 30000, ['size', 'temp', 'sugar', 'addon'], [['Biji Kopi Arabika', 18], ['Susu Segar', 150], ['Cup Plastik 16oz', 1]]],
  ['Kopi', 'Cafe Latte', 32000, ['size', 'temp', 'sugar', 'addon'], [['Biji Kopi Arabika', 18], ['Susu Segar', 200], ['Cup Plastik 16oz', 1]]],
  ['Kopi', 'Es Kopi Susu Gula Aren', 28000, ['size', 'sugar', 'addon'], [['Biji Kopi Arabika', 18], ['Susu Segar', 150], ['Gula Aren Cair', 30], ['Cup Plastik 16oz', 1]]],
  ['Kopi', 'Vanilla Latte', 35000, ['size', 'temp', 'addon'], [['Biji Kopi Arabika', 18], ['Susu Segar', 200], ['Sirup Vanila', 20], ['Cup Plastik 16oz', 1]]],
  ['Kopi', 'Caramel Macchiato', 38000, ['size', 'temp', 'addon'], [['Biji Kopi Arabika', 18], ['Susu Segar', 200], ['Sirup Karamel', 25], ['Cup Plastik 16oz', 1]]],
  ['Non-Kopi', 'Matcha Latte', 33000, ['size', 'temp', 'sugar', 'addon'], [['Bubuk Matcha', 10], ['Susu Segar', 200], ['Cup Plastik 16oz', 1]]],
  ['Non-Kopi', 'Chocolate', 30000, ['size', 'temp', 'sugar', 'addon'], [['Bubuk Coklat', 25], ['Susu Segar', 200], ['Cup Plastik 16oz', 1]]],
  ['Teh', 'Lemon Tea', 22000, ['size', 'temp', 'sugar'], [['Teh Celup', 1], ['Lemon', 0.5], ['Cup Plastik 16oz', 1]]],
  ['Teh', 'Teh Tawar', 15000, ['temp'], [['Teh Celup', 1]]],
  ['Makanan', 'Croissant Butter', 28000, [], [['Croissant Beku', 1]]],
  ['Makanan', 'Chicken Sandwich', 42000, [], [['Roti Tawar', 2], ['Dada Ayam', 100], ['Keju Slice', 1]]],
  ['Snack', 'French Fries', 25000, [], [['Kentang Beku', 150]]],
  ['Dessert', 'Cheesecake', 35000, [], [['Cheesecake Slice', 1]]],
  ['Minuman', 'Air Mineral', 10000, [], [['Air Mineral Botol', 1]]],
];

/** Resep tambahan bila opsi tertentu dipilih. */
const OPTION_RECIPES: [group: string, option: string, ingredient: string, qty: number][] = [
  ['size', 'Large', 'Susu Segar', 80],
  ['addon', 'Extra Shot', 'Biji Kopi Arabika', 18],
  ['addon', 'Oat Milk', 'Oat Milk', 200],
  ['addon', 'Whipped Cream', 'Whipped Cream', 30],
];

/** PIN owner production: 6 angka dan bukan pola yang mudah ditebak. */
export function isStrongOwnerPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  if (/^(\d)\1{5}$/.test(pin)) return false;
  const asc = '0123456789012345';
  const desc = '9876543210987654';
  if (asc.includes(pin) || desc.includes(pin)) return false;
  return !['123123', '112233', '121212', '696969', '101010', '200000'].includes(pin);
}

export interface InitialOwner {
  name: string;
  username: string;
  pin: string;
}

/**
 * Isi database kosong.
 * - Development: akun contoh (PIN bawaan) + contoh menu.
 * - Production: HANYA satu akun owner dari environment (tanpa PIN bawaan); kasir/barista dibuat owner lewat menu Hak Akses.
 */
export async function seed(
  db: pg.Pool = pool,
  opts: { demo?: boolean; log?: (s: string) => void; initialOwner?: InitialOwner } = {},
) {
  const log = opts.log ?? console.log;
  const demo = opts.demo ?? true;

  const { rows: u } = await db.query<{ n: number }>('select count(*)::int as n from users');
  if (u[0].n === 0 && opts.initialOwner) {
    const o = opts.initialOwner;
    if (!isStrongOwnerPin(o.pin)) throw new Error('INITIAL_OWNER_PIN harus 6 angka dan tidak mudah ditebak (bukan 123456, 111111, dsb).');
    await db.query("insert into users (name, username, role, pin_hash) values ($1, $2, 'owner', $3)", [o.name, o.username, await hashPin(o.pin)]);
    log(`Akun owner pertama dibuat: username "${o.username}". PIN sesuai INITIAL_OWNER_PIN (tidak ditampilkan).`);
  } else if (u[0].n === 0) {
    for (const a of DEFAULT_ACCOUNTS) {
      await db.query('insert into users (name, username, role, pin_hash) values ($1, $2, $3, $4)', [a.name, a.username, a.role, await hashPin(a.pin)]);
    }
    log('Akun default dibuat (SEGERA ganti PIN di menu Pengguna):');
    for (const a of DEFAULT_ACCOUNTS) log(`  ${a.role.padEnd(8)} username: ${a.username.padEnd(8)} PIN: ${a.pin}`);
  }

  for (const key of ['store', 'pricing', 'policy'] as const) {
    await db.query('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, JSON.stringify(DEFAULT_SETTINGS[key])]);
  }

  const { rows: c } = await db.query<{ n: number }>('select count(*)::int as n from categories');
  if (!demo || c[0].n > 0) return;

  const owner = (await db.query("select id from users where role = 'owner' order by created_at limit 1")).rows[0]?.id ?? null;
  const ing = new Map<string, string>();
  for (const [name, unit, station, minStock, cost, stock] of INGREDIENTS) {
    const { rows } = await db.query(
      'insert into ingredients (name, unit, station, min_stock, cost_per_unit) values ($1,$2,$3,$4,$5) returning id',
      [name, unit, station, minStock, cost],
    );
    ing.set(name, rows[0].id);
    await db.query(
      "insert into stock_movements (ingredient_id, qty, type, unit_cost, note, user_id) values ($1, $2, 'adjust', $3, 'Stok awal', $4)",
      [rows[0].id, stock, cost, owner],
    );
  }

  const groupIds = new Map<string, string>();
  const optionIds = new Map<string, string>();
  for (const [gi, g] of GROUPS.entries()) {
    const { rows } = await db.query('insert into option_groups (name, multi, required, sort) values ($1,$2,$3,$4) returning id', [
      g.name,
      g.multi,
      g.required,
      gi,
    ]);
    groupIds.set(g.key, rows[0].id);
    for (const [oi, o] of g.options.entries()) {
      const r = await db.query('insert into options (group_id, name, price_delta, sort) values ($1,$2,$3,$4) returning id', [
        rows[0].id,
        o.name,
        o.price,
        oi,
      ]);
      optionIds.set(`${g.key}:${o.name}`, r.rows[0].id);
    }
  }

  const cats = new Map<string, string>();
  for (const [i, name] of [...new Set(PRODUCTS.map((p) => p[0]))].entries()) {
    const { rows } = await db.query('insert into categories (name, sort) values ($1, $2) returning id', [name, i]);
    cats.set(name, rows[0].id);
  }

  for (const [i, [cat, name, price, groups, recipe]] of PRODUCTS.entries()) {
    const { rows } = await db.query('insert into products (category_id, name, price, sort) values ($1,$2,$3,$4) returning id', [
      cats.get(cat),
      name,
      price,
      i,
    ]);
    const pid = rows[0].id;
    for (const [gi, g] of groups.entries()) {
      await db.query('insert into product_option_groups (product_id, group_id, sort) values ($1,$2,$3)', [pid, groupIds.get(g), gi]);
    }
    for (const [ingName, qty] of recipe) {
      await db.query('insert into recipe_items (product_id, ingredient_id, qty) values ($1,$2,$3)', [pid, ing.get(ingName), qty]);
    }
    for (const [g, opt, ingName, qty] of OPTION_RECIPES) {
      if (!groups.includes(g)) continue;
      await db.query('insert into recipe_items (product_id, option_id, ingredient_id, qty) values ($1,$2,$3,$4)', [
        pid,
        optionIds.get(`${g}:${opt}`),
        ing.get(ingName),
        qty,
      ]);
    }
  }
  log(`Contoh menu dibuat: ${PRODUCTS.length} produk, ${INGREDIENTS.length} bahan, ${GROUPS.length} grup opsi.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = !process.argv.includes('--tanpa-contoh');
  migrate()
    .then(() => seed(pool, { demo }))
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
