-- Menu yang dihapus owner: disembunyikan dari semua daftar, tetapi barisnya dipertahankan supaya
-- riwayat penjualan, kategori di laporan, dan HPP transaksi lama tetap bisa dihitung.
alter table products add column if not exists deleted_at timestamptz;
