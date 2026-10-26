-- Keamanan login: kata sandi owner untuk login online (PIN tetap untuk tablet), dan versi sesi supaya
-- semua sesi lama berakhir saat kata sandi/PIN diganti atau owner menekan "Keluar dari semua perangkat".
alter table users add column if not exists password_hash text;
alter table users add column if not exists session_version int not null default 0;
