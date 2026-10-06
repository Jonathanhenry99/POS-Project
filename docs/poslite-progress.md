# Catatan pekerjaan POSLite — 6 Oktober 2026

Acuan adalah ESB POSLite kasir tablet, implementasi Mourden tetap berbasis web. Fitur existing dipertahankan; perubahan ini menambahkan fitur operasional secara bertahap.

## Sudah ditambahkan

- Sidebar kiri dengan section Penjualan, Operasional, Perangkat, dan Pengelolaan. Bisa diperkecil; pilihan disimpan pada perangkat. Menu mengikuti permission existing.
- Menu Ganti Shift / Hari (`/hari`): rekapitulasi penjualan, Akhiri Shift, Tutup Toko / Hari, riwayat shift, dan detail rekap hari.
- Hari usaha per terminal, terkait beberapa shift. Tutup kasir existing tetap tersedia dan tidak otomatis menutup hari. Tanggal kalender transaksi dan laporan lama tidak diubah.
- Snapshot rekap hari, kas akhir shift terakhir, selisih seluruh shift, serta cetak ulang rekap hari melalui driver existing. Modal pergantian shift tidak dihitung sebagai penjualan.
- Persist hari/shift/outbox secara atomik di IndexedDB, migrasi tambah-only `003_business_days.sql`, endpoint idempotent, validasi kelengkapan order sebelum finalisasi hari, dan arsip server yang dibatasi terminal kasir.
- Filter riwayat lokal berdasarkan tanggal zona waktu toko, status, metode pembayaran, dan pencarian existing. Tampilkan berikutnya menghindari render seluruh daftar sekaligus; batas 300 pada query lokal dihapus.
- Profil pengaturan printer lokal (preset jalur dan format), perintah drawer tanpa transaksi beserta log offline/server, serta penjelasan bahwa sukses mengirim data belum membuktikan hasil cetak fisik.
- Menu Meja & pesanan, meja/pax pada transaksi/struk/checker, pindah meja dan jumlah item ke pesanan tersimpan yang kompatibel. Data pesanan belum dibayar tetap lokal pada terminal.
- Master meja, catatan per kategori, alasan Menu/Order/Void dan station produk di pengaturan owner; diterima tablet melalui bootstrap existing. Catatan/alasan existing tetap tersedia.
- Arsip transaksi server kasir khusus terminal dengan pagination cursor 100 order; cache tidak menimpa order/void lokal belum sinkron.
- Antrean cetak persisten terpisah dari outbox transaksi. Klaim job atomik, retry dengan pemeriksaan hasil fisik, salinan baru tanpa pulsa drawer, dan tidak mengirim ulang otomatis sesudah restart.
- Routing checker station Umum/Bar/Dapur, mode per pesanan/baris menu/jumlah, serta bridge LAN mandiri dengan target terdaftar, token/origin, ledger deduplikasi persisten dan serialisasi per printer.
- ID pembayaran tetap dan penanda selesai untuk mencegah retry ganda serta mengunci keranjang selesai saat pengosongan gagal. Tombol Hapus diskon diperbaiki agar benar-benar melepas diskon sebelum transfer.
- Halaman operasional dimuat bertahap; seluruh chunk tetap masuk precache PWA. Sidebar juga tersedia pada halaman stok mode tablet.

## Perilaku penting

- Hari usaha hanya terminal ini, bukan penutupan seluruh outlet. Shift berikutnya bergabung dengan hari aktif sampai hari ditutup secara eksplisit, termasuk bila melewati tengah malam.
- Keranjang aktif dan pesanan tersimpan tetap dipertahankan ketika shift/hari ditutup. UI menampilkan jumlah pesanan belum dibayar.
- Penutupan offline tercatat lokal dan masuk antrean; status menunggu/gagal tidak ditampilkan sebagai finalisasi server yang selesai.
- Rekap tertutup menggunakan snapshot saat shift ditutup. Void setelahnya tetap mengikuti alur existing dan terlihat pada riwayat transaksi; snapshot lama tidak ditulis ulang diam-diam.
- Routing station memakai profil lokal. RawBT tetap memilih printer melalui aplikasinya; USB/Serial tetap memakai pemilihan perangkat existing. Untuk beberapa printer LAN, gunakan bridge dan ID target berbeda. Service belum dipasang ke jaringan cafe dan hasil fisik belum diuji.
- Pemindahan qty sumber/tujuan ditulis bersama; diskon harus dilepas dahulu supaya potongan tidak ganda. Gunakan satu tab aktif untuk pesanan per terminal; ini belum menjadi reservasi meja/pesanan bersama lintas tablet.
- Pembayaran memakai EDC Mandiri eksternal sesuai arahan pengguna. QRIS/kartu tetap dikonfirmasi manual dan nomor reference/approval dicatat; gateway otomatis bukan pekerjaan yang tersisa untuk setup ini.
- Drawer hanya tersedia untuk role dengan `pos.shift`, saat opsi drawer aktif dan jalur bukan browser fallback. Kompatibilitas fisik harus diuji pada tablet/printer asli.

## Validasi dan cara melanjutkan

Pemeriksaan: `npm run typecheck`, `npm run build`, dan tes semua workspace. Tes API dapat menggunakan cluster development yang sudah berjalan dengan `MOURDEN_TEST_CLUSTER_URL` menunjuk database administratif cluster tersebut. Setup membuat database test baru dengan nama acak dan menghapus hanya database test itu setelah selesai; database Mourden tidak digunakan untuk tes.

Hasil akhir tahap lanjutan: 101 tes lulus (34 shared, 34 API/bridge, 33 web), typecheck dan production build lulus. Chunk awal kasir turun dari sekitar 458 KB menjadi 318 KB; 28 entri aset/chunk masuk precache PWA. Pembayaran EDC tetap manual dan tidak ada transaksi cafe yang dibuat untuk pengujian.

Tes regresi mencakup pergantian shift/hari, kas, snapshot, offline/retry, tengah malam, tab dengan shift lama, isolasi terminal/permission, kelengkapan order, lebar struk/checker 32/48, transfer qty/opsi/catatan, storage gagal tanpa kehilangan item, pembayaran idempotent/penanda selesai, arsip cursor/void lokal, klaim antrean, routing batch, bridge restart/dedupe/kegagalan/serialisasi serta socket TCP simulasi. Tes API menggunakan database acak terpisah, bukan database cafe.

Pemeriksaan UI desktop: sidebar kiri terlihat, perkecil/perluas berfungsi; menu Meja & pesanan, Antrean cetak, pengaturan/routing printer dan Arsip server dibuka tanpa error browser. Tidak membuat transaksi cafe atau mengubah master/perangkat printer untuk pengujian UI.

Yang masih memerlukan perangkat/config nyata: pengisian master meja/station sesuai cafe, menjalankan service bridge pada jaringan lokal bila memakai printer LAN, certificate/izin browser dan uji fisik Redmi Pad 2/EP58M. Bukan fitur web yang diklaim sudah terhubung otomatis. Panduan penggunaan: `docs/panduan-pos-tablet.md`; setup dan checklist printer: `docs/print-bridge.md`.

Jika localhost masih menampilkan navbar lama, muat ulang tab dengan Cmd+Shift+R. Migrasi database baru diterapkan oleh startup server seperti mekanisme existing; jangan reset database atau data browser.
