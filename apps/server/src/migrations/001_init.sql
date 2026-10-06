-- Skema awal Mourden POS

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  role text not null check (role in ('owner', 'kasir', 'barista', 'kitchen')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Perangkat kasir (tablet) yang sudah diaktifkan owner. Token disimpan dalam bentuk hash.
create table devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  token_hash text not null unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Menu ----------

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  name text not null,
  sku text not null default '',
  price integer not null check (price >= 0),
  active boolean not null default true,
  sold_out boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table option_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  multi boolean not null default false,
  required boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references option_groups(id) on delete cascade,
  name text not null,
  price_delta integer not null default 0,
  active boolean not null default true,
  sort integer not null default 0
);

create table product_option_groups (
  product_id uuid not null references products(id) on delete cascade,
  group_id uuid not null references option_groups(id) on delete cascade,
  sort integer not null default 0,
  primary key (product_id, group_id)
);

-- ---------- Bahan & resep ----------

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  station text not null check (station in ('bar', 'kitchen', 'umum')),
  min_stock numeric(14, 3) not null default 0,
  cost_per_unit numeric(14, 4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- option_id null = resep dasar produk; terisi = tambahan bila opsi itu dipilih (mis. Large, Extra Shot).
create table recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  option_id uuid references options(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  qty numeric(14, 3) not null check (qty > 0)
);
create index recipe_items_product_idx on recipe_items(product_id);

-- ---------- Shift & transaksi (ID dibuat oleh tablet agar sinkronisasi idempotent) ----------

create table shifts (
  id uuid primary key,
  device_id uuid references devices(id),
  opened_by uuid references users(id),
  opened_by_name text not null default '',
  opened_at timestamptz not null,
  opening_cash integer not null default 0,
  cash_movements jsonb not null default '[]',
  closed_by uuid references users(id),
  closed_by_name text not null default '',
  closed_at timestamptz,
  counted_cash integer,
  closing_note text not null default '',
  summary jsonb,
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key,
  number text not null unique,
  device_id uuid references devices(id),
  shift_id uuid,
  cashier_id uuid references users(id),
  cashier_name text not null,
  created_at timestamptz not null,
  business_date date not null,
  customer_name text not null default '',
  discount jsonb,
  subtotal integer not null,
  discount_amount integer not null default 0,
  service_pct numeric(5, 2) not null default 0,
  service_amount integer not null default 0,
  tax_pct numeric(5, 2) not null default 0,
  tax_label text not null default '',
  tax_amount integer not null default 0,
  rounding_amount integer not null default 0,
  total integer not null,
  payment_method text not null check (payment_method in ('cash', 'qris', 'card')),
  payment_amount integer not null,
  tendered integer not null,
  change integer not null default 0,
  payment_reference text not null default '',
  status text not null default 'paid' check (status in ('paid', 'void')),
  void_reason text not null default '',
  voided_at timestamptz,
  voided_by uuid references users(id),
  voided_by_name text not null default '',
  void_approved_by uuid references users(id),
  synced_at timestamptz not null default now()
);
create index orders_business_date_idx on orders(business_date);
create index orders_shift_idx on orders(shift_id);

create table order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid,
  name text not null,
  base_price integer not null,
  unit_price integer not null,
  qty integer not null check (qty > 0),
  options jsonb not null default '[]',
  note text not null default '',
  line_total integer not null,
  sort integer not null default 0
);
create index order_items_order_idx on order_items(order_id);
create index order_items_product_idx on order_items(product_id);

-- ---------- Stok: buku besar pergerakan. Stok saat ini = jumlah qty. ----------

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id),
  qty numeric(14, 3) not null,
  type text not null check (type in ('sale', 'void', 'purchase', 'waste', 'opname', 'adjust')),
  unit_cost numeric(14, 4) not null default 0,
  ref_type text,
  ref_id uuid,
  note text not null default '',
  user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index stock_movements_ingredient_idx on stock_movements(ingredient_id, created_at);
create index stock_movements_ref_idx on stock_movements(ref_type, ref_id);

create table opnames (
  id uuid primary key,
  station text not null check (station in ('bar', 'kitchen', 'umum')),
  business_date date not null,
  user_id uuid references users(id),
  user_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table opname_items (
  opname_id uuid not null references opnames(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  system_qty numeric(14, 3) not null,
  counted_qty numeric(14, 3) not null,
  diff numeric(14, 3) not null,
  unit_cost numeric(14, 4) not null default 0,
  primary key (opname_id, ingredient_id)
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb
);
create index audit_log_at_idx on audit_log(at);
