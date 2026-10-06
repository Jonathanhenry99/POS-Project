-- Tambahan metadata per terminal; tidak mengubah data/tanggal transaksi atau shift lama.
create table business_days (
  id uuid primary key,
  device_id uuid not null references devices(id),
  business_date date not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index business_days_device_date_idx on business_days(device_id, business_date);
alter table shifts add column business_day_id uuid references business_days(id);
alter table shifts add column close_mode text check (close_mode in ('shift', 'day'));
create index shifts_business_day_idx on shifts(business_day_id);
