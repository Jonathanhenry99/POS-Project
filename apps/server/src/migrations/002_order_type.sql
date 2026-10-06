-- Tipe pesanan (Dine In / Take Away) untuk struk dan laporan.
alter table orders add column order_type text not null default 'dine_in' check (order_type in ('dine_in', 'take_away'));
