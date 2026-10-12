-- Opname dengan kemasan: isi bersih per kemasan segel dan berat wadah kosong per bahan (0 = tidak dipakai).
alter table ingredients add column if not exists pack_size numeric(14, 3) not null default 0;
alter table ingredients add column if not exists container_weight numeric(14, 3) not null default 0;
-- Rincian hitung (segel, berat timbangan, jumlah wadah) disimpan agar owner bisa memeriksa asal angka bersih.
alter table opname_items add column if not exists detail jsonb;
