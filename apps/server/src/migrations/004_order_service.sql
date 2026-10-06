-- Metadata pelayanan opsional. Transaksi lama dan perhitungannya tidak berubah.
alter table orders add column if not exists table_name text not null default '';
alter table orders add column if not exists pax integer not null default 0;
create index if not exists orders_device_created_idx on orders(device_id, created_at desc, id desc);
