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

## Perilaku penting

- Hari usaha hanya terminal ini, bukan penutupan seluruh outlet. Shift berikutnya bergabung dengan hari aktif sampai hari ditutup secara eksplisit, termasuk bila melewati tengah malam.
- Keranjang aktif dan pesanan tersimpan tetap dipertahankan ketika shift/hari ditutup. UI menampilkan jumlah pesanan belum dibayar.
- Penutupan offline tercatat lokal dan masuk antrean; status menunggu/gagal tidak ditampilkan sebagai finalisasi server yang selesai.
- Rekap tertutup menggunakan snapshot saat shift ditutup. Void setelahnya tetap mengikuti alur existing dan terlihat pada riwayat transaksi; snapshot lama tidak ditulis ulang diam-diam.
- Profil printer belum merupakan routing beberapa printer fisik. RawBT tetap memilih printer melalui aplikasinya; USB/Serial tetap memakai pemilihan perangkat existing. Tidak ada driver raw TCP/LAN palsu.
- Drawer hanya tersedia untuk role dengan `pos.shift`, saat opsi drawer aktif dan jalur bukan browser fallback. Kompatibilitas fisik harus diuji pada tablet/printer asli.

## Validasi dan cara melanjutkan

Pemeriksaan: `npm run typecheck`, `npm run build`, dan tes semua workspace. Tes API dapat menggunakan cluster development yang sudah berjalan dengan `MOURDEN_TEST_CLUSTER_URL` menunjuk database administratif cluster tersebut. Setup membuat database test baru dengan nama acak dan menghapus hanya database test itu setelah selesai; database Mourden tidak digunakan untuk tes.

Tes regresi mencakup pergantian beberapa shift, tutup hari, pemisahan tunai/non-tunai, modal tidak ganda, penutupan offline/retry, snapshot, tengah malam, tab dengan shift lama, isolasi permission/terminal, validasi order belum tersinkron, dan lebar struk 32/48 karakter. Printer fisik dan seluruh alur UI belum diverifikasi di tablet cafe.

Tahap lanjutan belum dikerjakan: routing station/printer dapur, antrean cetak persisten, meja/pax serta pemindahan pesanan Full Service, arsip order server kasir, template catatan/alasan dari master, gateway QRIS otomatis. Tinjau kebutuhan cafe sebelum menambahkan; jangan membangun ulang offline queue, pembayaran, role, stok, atau printer existing.

Jika localhost masih menampilkan navbar lama, muat ulang tab dengan Cmd+Shift+R. Migrasi database baru diterapkan oleh startup server seperti mekanisme existing; jangan reset database atau data browser.
