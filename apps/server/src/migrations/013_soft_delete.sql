-- Hapus oleh owner untuk kategori, varian & add-on, bahan, pengguna dan perangkat yang sudah dicabut.
-- Sama seperti menu (012): baris hanya ditandai terhapus dan disembunyikan dari semua daftar, karena
-- transaksi, pergerakan stok, opname dan log lama masih merujuk ke baris ini.
alter table categories add column if not exists deleted_at timestamptz;
alter table option_groups add column if not exists deleted_at timestamptz;
alter table ingredients add column if not exists deleted_at timestamptz;
alter table users add column if not exists deleted_at timestamptz;
alter table devices add column if not exists deleted_at timestamptz;
