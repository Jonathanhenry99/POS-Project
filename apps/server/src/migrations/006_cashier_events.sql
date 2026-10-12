-- Jejak aktivitas kasir yang berisiko (dikirim tablet, ID dari klien agar idempotent) + tanda "sudah ditinjau" owner.
create table if not exists cashier_events (
  id uuid primary key,
  device_id uuid references devices(id),
  user_id uuid references users(id),
  user_name text not null default '',
  at timestamptz not null,
  business_date date not null,
  type text not null check (type in ('bill_printed', 'order_deleted', 'item_removed')),
  order_ref text not null default '',
  label text not null default '',
  amount integer not null default 0,
  item_count integer not null default 0,
  bill_prints integer not null default 0,
  reason text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cashier_events_date_idx on cashier_events(business_date);

create table if not exists review_marks (
  key text primary key,
  user_id uuid references users(id),
  at timestamptz not null default now()
);
