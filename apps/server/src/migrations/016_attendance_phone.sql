-- Absen dari HP karyawan (akun barista/kitchen): sumber, lokasi saat absen, dan jaraknya ke toko.
alter table attendance add column if not exists source text not null default 'tablet';
alter table attendance add column if not exists lat double precision;
alter table attendance add column if not exists lng double precision;
alter table attendance add column if not exists accuracy_m int;
alter table attendance add column if not exists distance_m int;
