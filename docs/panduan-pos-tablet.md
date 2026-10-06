# Panduan fitur POS tablet Mourden

Acuan fitur adalah ESB POSLite kasir tablet. Mourden tetap memakai web/PWA dan alur pembayaran, stok, role, offline queue, serta driver printer existing. Dokumen ini menjelaskan implementasi Mourden per 6 Oktober 2026; bukan klaim bahwa setiap fitur ESB atau integrasi perangkat fisik sudah identik.

## Sidebar kiri

Menu dikelompokkan menjadi Penjualan, Operasional, Perangkat, dan Pengelolaan. Tombol Perkecil menu menampilkan ikon untuk memberi ruang menu dan keranjang; Perluas menu mengembalikan label. Preferensi disimpan di perangkat. Navigasi mengikuti permission role, sehingga kasir tidak memperoleh akses admin melalui menu baru. Halaman stok mode tablet juga menggunakan sidebar ini; alur stok mode online tetap tersedia.

## Kasir

**Dine In / Take Away** menentukan mode penjualan. Nama pelanggan/info tambahan tetap tersedia. Cari menu, kategori, Favorit, varian/add-on, kuantitas, catatan, sold out, Promo, Simpan, Cetak Struk sementara, dan Bayar tetap memakai alur existing.

**Meja & pax** memilih meja kosong dan jumlah tamu. Pax boleh 0 jika tidak diisi. Meja hanya untuk Dine In; Take Away mengosongkan pilihan meja. Meja/pax ikut tersimpan dalam pesanan, transaksi lunas, sinkronisasi server, tagihan, struk, dan checker. Mengganti meja mengubah metadata tanpa mengganti item, harga, atau metode pembayaran.

**Simpan / Tersimpan** menahan pesanan yang belum dibayar, lalu membuka keranjang baru. Saat pesanan tersimpan dibuka, perubahan keranjang juga memperbarui pesanan aktif tersebut; membuka pesanan lain tetap menyimpan keranjang sebelumnya. Pesanan tersimpan belum dianggap penjualan dan belum memotong stok bahan. Data ini lokal pada tablet; pemakaian meja belum merupakan reservasi lintas tablet.

**Pindahkan item** memilih sebagian atau seluruh jumlah item untuk dipindahkan ke pesanan baru atau pesanan tersimpan lain dengan tipe yang sama. Pilihan varian, harga tambahan, catatan dan jumlah dipertahankan. Tujuan tidak boleh sama dengan sumber; meja tujuan harus kosong. Pindah seluruh item perlu konfirmasi dan mengosongkan sumber saja. Sumber dan tujuan ditulis bersama dalam satu salinan sesi lokal; bila penyimpanan gagal, perubahan tidak diterapkan setengah jalan.

Pesanan dengan diskon harus melepas diskon sebelum transfer. Setelah transfer, terapkan kembali diskon pada pesanan yang sesuai. Hal ini mencegah potongan nominal/persen disalin dua kali atau berubah diam-diam. Tombol Hapus diskon kini benar-benar menghapus diskon; kebijakan PIN owner untuk pemberian diskon tetap berlaku.

**Checker dapur/bar** menyiapkan tiket dari seluruh item keranjang saat ini sesuai station produk. Ini bukan tagihan/bukti bayar dan tidak mencatat pembayaran atau mengurangi stok. Konfirmasikan bahwa item belum dikirim ke produksi, lalu kirim tiket dari Antrean cetak. Tombol ini tidak otomatis menghitung delta item yang pernah dibuat dapur; cetak checker tambahan harus diperiksa agar pesanan tidak dibuat dua kali.

## Meja & pesanan

Halaman ini menampilkan daftar meja master dan pesanan tersimpan pada tablet. Meja ditandai Kosong, Pesanan aktif, atau Tersimpan. Menekan meja terisi membuka pesanannya; meja kosong dapat dipilih untuk pesanan baru atau pindah seluruh pesanan aktif setelah konfirmasi. Pesanan tanpa meja tetap masuk daftar tersimpan.

**Buka** melanjutkan pesanan di kasir. **Batalkan** meminta alasan sebelum menghapus pesanan belum dibayar. Hapus item dari sheet varian menggunakan kategori alasan Menu; batal pesanan memakai kategori Order. Alasan manual tetap boleh dimasukkan. Pembatalan pesanan belum dibayar tidak menjalankan void stok/transaksi lunas. Kontrol kuantitas existing tetap tersedia.

**Log pesanan tablet** menyimpan 100 aksi pembatalan/pemindahan terbaru beserta waktu, operator dan alasan jika ada. Log ini lokal; berbeda dengan audit server untuk transaksi lunas/void/drawer.

Gunakan satu tab/PWA aktif untuk mengerjakan pesanan pada satu terminal. Ada pemeriksaan perubahan sesi dari tab lain, tetapi ini tidak menggantikan sistem reservasi dan konflik pesanan lintas perangkat.

## Pembayaran EDC Mandiri eksternal

EDC Mandiri tetap digunakan sebagai perangkat pembayaran terpisah. Kasir memastikan pembayaran berhasil di EDC/merchant, memilih QRIS atau Debit/Kredit yang sesuai, dan mengisi nomor referensi/approval jika tersedia. Mourden mencatat hasilnya secara manual; tidak memanggil gateway, menarik dana, atau menganggap munculnya QR sebagai pembayaran berhasil. Tunai tetap menghitung uang diterima/kembalian.

Bayar & Cetak menyimpan order lokal dan outbox terlebih dahulu; kegagalan printer tidak membatalkan pembayaran. Keranjang mempunyai ID pembayaran tetap agar retry tidak membuat nomor/order kedua. Jika order sudah tersimpan tetapi penyimpanan keranjang gagal, keranjang selesai dikunci sampai dapat dikosongkan. Status selesai juga diperiksa setelah reload. Penanda pembayaran tetap disimpan walaupun salinan transaksi lokal kemudian dipangkas; gunakan arsip untuk membuka struknya.

## Riwayat transaksi

**Shift ini** menampilkan transaksi shift berjalan. **Semua di tablet** menampilkan data lokal. Pencarian nomor/nama, tanggal zona waktu toko, status Lunas/Void, dan metode pembayaran dapat dipakai bersama. Reset filter mengembalikan pilihan. Rendering bertahap menjaga tablet tidak menampilkan seluruh daftar sekaligus.

**Arsip server** memuat transaksi terminal ini dari server, termasuk yang tidak ada pada cache tablet. Tanggal kosong berarti hari ini; pilih rentang untuk mencari hari sebelumnya. Tiap halaman berisi paling banyak 100 transaksi dengan cursor waktu/ID, sehingga waktu yang sama tidak membuat hasil terlewat/duplikat. Arsip yang dimuat disalin ke cache lokal; order/void lokal yang masih menunggu atau gagal sinkron tidak ditimpa versi server lama. Arsip memerlukan koneksi saat dimuat; data yang sudah ada dapat dibuka lewat Semua di tablet saat offline, selama belum dipangkas oleh retensi lokal.

Detail tetap menyediakan pratinjau/cetak ulang dan void sesuai izin existing. Void transaksi lunas memakai alasan kategori Void, kebijakan PIN owner, antrean sinkron, serta pengembalian stok existing. Rekap shift/hari yang sudah ditutup tetap memakai snapshot penutupannya; void sesudah penutupan tidak mengubah snapshot lama diam-diam.

## Shift & kas

Menu existing untuk membuka shift, memasukkan modal awal, Kas Masuk/Kas Keluar dengan catatan, melihat kas seharusnya, menghitung kas fisik, menutup shift dan mencetak rekap tetap tersedia. Uang tunai memengaruhi laci; QRIS/kartu masuk total penjualan tetapi tidak menambah kas fisik. Mengunci layar/ganti operator bukan menutup shift.

## Ganti Shift / Hari

**Rekapitulasi penjualan** menampilkan hari usaha aktif terminal ini, beberapa shift yang tergabung, jumlah transaksi/void, penjualan, metode pembayaran, kas masuk/keluar, kas terakhir dan selisih. Modal perpindahan shift tidak dijumlah sebagai penjualan atau modal usaha baru berkali-kali.

**Akhiri Shift** untuk serah terima kasir: isi kas fisik, periksa selisih, konfirmasi dan simpan catatan penutupan. Hari usaha tetap aktif; shift berikutnya bergabung pada hari tersebut. Pesanan aktif/tersimpan tidak otomatis dibatalkan.

**Tutup Toko / Hari** untuk shift terakhir terminal: tutup shift jika masih aktif, lalu finalisasi hari. Hari tidak dapat difinalisasi selama masih ada shift aktif. Hari berikutnya dibuat ketika shift baru dibuka setelah penutupan hari sebelumnya.

**Riwayat shift** dan **Detail rekap hari** menyediakan filter tanggal, arsip server khusus terminal, detail snapshot dan cetak ulang. Hari usaha dapat melewati tengah malam; tanggal kalender transaksi/laporan lama tetap mengikuti aturan existing. Penutupan ini per terminal, bukan penguncian semua terminal outlet.

Penutupan offline tersimpan lokal dan masuk antrean. Menunggu/gagal sinkron ditampilkan; finalisasi server tidak diklaim selesai sebelum diterima. Server memeriksa shift dan kelengkapan order sebelum menerima snapshot hari. Kirim ulang ID yang sama tidak membuat hari/shift ganda.

## Pengaturan printer

**Profil printer aktif** menyimpan jalur dan format lokal. Profil aktif dipakai untuk struk, tagihan dan rekap kasir. Beberapa profil memudahkan preset, tetapi RawBT tetap memilih printer melalui aplikasinya; USB/Serial mengikuti pemilihan perangkat existing.

**Jalur cetak** menyediakan RawBT utama, Web Serial dan USB eksperimen, Bridge LAN eksperimen, serta browser fallback darurat. Bridge menargetkan ID printer yang terdaftar pada service jaringan cafe. Jangan mengisi IP printer langsung sebagai URL bridge; printer TCP tidak melayani protokol HTTP aplikasi. Panduan service: [print-bridge.md](print-bridge.md).

**Lebar kertas** memilih 32 karakter/58 mm atau 48 karakter/80 mm. **Feed** menambah baris untuk sobek kertas. **Cutter** hanya diaktifkan bila perangkat mendukung. **Salinan** menentukan jumlah struk penjualan dalam satu pengiriman; cetak ulang memakai satu salinan. **Cetak otomatis** mengaktifkan Bayar & Cetak. **Drawer** menambahkan pulsa laci untuk transaksi tunai jika laci terhubung ke printer.

**Buka laci tanpa transaksi** tersedia bagi role `pos.shift`, saat drawer diaktifkan dan jalur mendukung byte raw. Perintah dicatat lokal dan masuk audit server; tidak membuat transaksi penjualan. Perintah drawer tersendiri tidak dijalankan ulang otomatis dari antrean cetak.

**Routing checker** menghubungkan station Umum, Bar dan Dapur ke profil lokal. Station tiap produk ditentukan dari master toko yang tersinkron. Mode Mourden: Per pesanan = satu tiket per station; Per baris menu = satu tiket tiap baris beserta jumlahnya; Per jumlah menu = satu tiket tiap unit. Maksimal 200 tiket per batch. Station yang belum dipetakan menolak seluruh batch, tanpa mengantrekan sebagian dan kehilangan sisanya. Arti mode ini adalah perilaku implementasi Mourden; tidak mengklaim detail internal ESB identik.

## Antrean cetak

Dokumen/format/target disimpan di IndexedDB sebelum pengiriman. Status: Menunggu kirim, Pengiriman dimulai, Data diserahkan, Gagal sebelum kirim, Hasil belum pasti, atau Antrean dibatalkan. Job tidak diulang otomatis ketika aplikasi dibuka kembali.

**Kirim** memproses job menunggu. **Periksa & coba lagi** meminta konfirmasi jika pengiriman sebelumnya mungkin sudah diterima. **Cetak salinan baru** membuat ID baru, memberi penanda SALINAN dan tidak mengulang pulsa drawer. **Batalkan antrean** hanya menghentikan job; transaksi tetap tersimpan. Pratinjau membantu memeriksa isi tiket. Dua tab tidak dapat mengklaim job yang sama bersamaan; job pengiriman yang terputus tidak langsung dianggap belum pernah dikirim.

Sukses transport bukan bukti kertas keluar. RawBT menyerahkan data ke aplikasi; USB/Serial/TCP menyerahkan byte ke jalur printer. Periksa hasil fisik dan checklist [bridge/printer](print-bridge.md) pada Redmi Pad 2 dan printer asli.

## Sinkronisasi dan master

Sinkronisasi transaksi/void/shift/hari tetap memakai outbox existing. Antrean cetak terpisah agar retry cetak tidak mengulang pembayaran atau stok. Master meja, catatan per kategori, alasan Menu/Order/Void, dan station produk ditambahkan pada Pengaturan owner. Simpan lalu lakukan sinkronisasi data/menu pada tablet. Catatan cepat/alasan existing dan input bebas tetap tersedia.

Profil printer, pemakaian meja, pesanan tersimpan, log pesanan dan dokumen cetak lokal tidak menjadi master bersama antar tablet. Integrasi EDC/gateway otomatis dan hasil printer fisik tidak diklaim sudah terhubung hanya karena fitur web tersedia.
