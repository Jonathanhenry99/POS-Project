-- Asal transaksi: 'pos' (tablet Mourden) atau 'esb' (diimpor dari ekspor POS lama). external_ref = nomor transaksi
-- di sistem asal, supaya impor ulang berkas yang sama tidak menggandakan penjualan.
alter table orders add column if not exists source text not null default 'pos' check (source in ('pos', 'esb'));
alter table orders add column if not exists external_ref text;
create unique index if not exists orders_source_ref_idx on orders(source, external_ref) where external_ref is not null;
