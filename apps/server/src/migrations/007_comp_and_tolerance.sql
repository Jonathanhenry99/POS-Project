-- Komplimen karyawan: transaksi menu asli bernilai Rp 0 atas nama penerima (bahan tetap terpotong lewat resep).
alter table orders add column if not exists comp_employee_id uuid references users(id);
alter table orders add column if not exists comp_employee_name text not null default '';
alter table orders add column if not exists comp_approved_by uuid references users(id);
create index if not exists orders_comp_idx on orders(business_date) where comp_employee_id is not null;

-- Toleransi selisih per bahan (% dari pemakaian). NULL = ikut toleransi bawaan di pengaturan.
alter table ingredients add column if not exists tolerance_pct numeric(5, 2);
