-- Perangkat uji owner (mode "Uji langsung" dari pratinjau kasir): tidak dihitung dalam batas jumlah tablet kasir.
alter table devices add column if not exists is_test boolean not null default false;
