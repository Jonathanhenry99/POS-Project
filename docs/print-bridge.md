# Bridge printer LAN Mourden

Bridge adalah service terpisah pada komputer/Raspberry Pi di jaringan cafe. Browser mengirim dokumen ESC/POS melalui HTTP/HTTPS; service meneruskan byte ke IP printer TCP yang sudah didaftarkan. Bridge tidak mengambil alih pembayaran atau database POS. EP58M Bluetooth/USB tetap memakai RawBT; bridge memerlukan printer yang mendukung TCP atau print server yang kompatibel.

## Konfigurasi service

Di `apps/server`, buat `.env.bridge` secara lokal. File ini diabaikan Git. Contoh berikut harus disesuaikan; jangan memakai token contoh untuk penggunaan sebenarnya:

```dotenv
PRINT_BRIDGE_TOKEN=GANTI_DENGAN_TOKEN_ACAK_MINIMAL_24_KARAKTER
PRINT_BRIDGE_ORIGINS=https://pos.cafe.example
PRINT_BRIDGE_PRINTERS={"bar":{"host":"192.168.1.50","port":9100},"dapur":{"host":"192.168.1.51","port":9100}}
PRINT_BRIDGE_PORT=9191
PRINT_BRIDGE_BIND=0.0.0.0
PRINT_BRIDGE_LEDGER=.print-bridge
```

`PRINT_BRIDGE_ORIGINS` menerima beberapa origin dipisah koma, tanpa path atau slash akhir. Untuk development pada komputer yang sama, origin bisa `http://localhost:5180`; tablet memiliki origin sesuai URL POS yang dibukanya. Default bind service adalah loopback `127.0.0.1`; akses tablet memerlukan bind pada interface jaringan cafe dan firewall yang membatasi jaringan lokal. Jangan membuka port bridge ke internet.

Alamat printer hanya IPv4 LAN/loopback yang didaftarkan di service. Browser mengirim ID seperti `bar`, bukan IP/port tujuan. Alamat/port printer tidak bisa diganti lewat request job. Gunakan satu instance service untuk satu folder ledger; jangan menjalankan dua instance dengan ledger yang sama.

Untuk HTTPS, tambahkan path certificate/key yang sah dan dipercaya perangkat:

```dotenv
PRINT_BRIDGE_TLS_CERT=/path/bridge-cert.pem
PRINT_BRIDGE_TLS_KEY=/path/bridge-key.pem
```

Jalankan dari root project:

```sh
npm run print:bridge -w @mourden/server
```

Service harus tersedia pada jaringan lokal walaupun internet putus. Menjalankan bridge tidak otomatis memasang autostart service OS; konfigurasi operasional PC/Raspberry Pi dilakukan pada perangkat yang dipilih.

## Konfigurasi tablet

1. Pengaturan printer → buat profil, misalnya “Bar LAN”.
2. Pilih Bridge jaringan; isi URL service, token, dan ID printer sesuai konfigurasi service.
3. Atur lebar kertas, feed, dan cutter profil tersebut. Tekan Tes printer; hasil pengiriman tercatat di Antrean cetak.
4. Buat profil Dapur dengan ID printer `dapur` bila memakai printer fisik lain.
5. Hubungkan station Bar/Dapur/Umum ke profil yang sesuai. Owner menentukan station setiap produk di Pengaturan → Master operasional kasir.
6. Profil aktif dipakai untuk struk/tagihan/rekap kasir. Profil station dipakai untuk checker; tidak perlu mengganti profil aktif saat membuat checker.

RawBT/USB/Serial tetap memakai perangkat fisik yang dipilih melalui jalur existing. Dua profil RawBT tidak otomatis berarti dua printer Bluetooth; untuk printer LAN berbeda gunakan ID bridge yang berbeda. Token hanya disimpan lokal di profil dan tidak dimasukkan ke arsip dokumen cetak.

## Antrean dan kegagalan

Job disimpan pada tablet sebelum dikirim. Bridge menyimpan ledger per ID job sebelum melakukan I/O. Pengiriman ulang ID/dokumen yang sudah berstatus `sent` tidak mengirim byte dua kali, termasuk setelah restart service. Mengubah isi/target dengan ID yang sama ditolak. Buat salinan baru dari UI untuk cetak ulang yang memang diinginkan; salinan diberi ID baru dan tidak mengulang pulsa drawer.

Jika koneksi putus atau proses mati setelah pengiriman dimulai, hasil mungkin belum pasti. Bridge menolak retry biasa; kasir memeriksa kertas lalu mengonfirmasi percobaan ulang di Antrean cetak. Tidak ada sistem yang dapat menjamin kertas tercetak tepat sekali hanya dari keberhasilan socket TCP. Kehilangan/penghapusan ledger juga menghilangkan perlindungan deduplikasi bridge; jangan hapus ledger untuk memperbaiki job gagal.

Satu printer menerima satu dokumen pada satu waktu dari instance bridge ini. Keberhasilan callback socket menunjukkan byte diserahkan ke jalur TCP, bukan sensor hasil cetak. Riwayat penjualan tetap tersimpan meskipun bridge/printer gagal.

## Browser dan jaringan

Browser dapat meminta izin akses jaringan lokal. Perilaku HTTP dari halaman HTTPS bergantung dukungan Local Network Access dan secure context; jangan menonaktifkan validasi certificate atau pengamanan browser. Implementasi mengirim `targetAddressSpace: local` untuk browser yang mendukungnya. Untuk lingkungan yang belum mendukung, gunakan endpoint HTTPS dengan certificate terpercaya dan origin/CORS sesuai POS.

Acuan: [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access), [MDN Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access), [Node TCP sockets](https://nodejs.org/api/net.html). Jalur ini belum diuji di Redmi Pad 2/printer cafe.

## Checklist perangkat asli

- [ ] Tes dari tablet mengirim ke ID/IP printer yang benar, tanpa dialog browser untuk RawBT/bridge.
- [ ] Lebar 32/48 karakter, nama panjang, varian, catatan, meja/pax dan cutter/feed sesuai.
- [ ] Menu Bar tidak masuk checker Dapur dan sebaliknya; mode per pesanan/item/jumlah benar.
- [ ] Matikan printer/jaringan: order tetap aman dan job menunggu/gagal/tidak pasti terlihat.
- [ ] Restart browser saat job terputus: tidak mencetak ulang otomatis.
- [ ] Restart bridge: ID yang sudah dikirim tidak mencetak dua kali.
- [ ] Konfirmasi retry setelah memeriksa kertas; salinan baru diberi penanda SALINAN.
- [ ] Internet putus dengan LAN tetap aktif: checker/struk lokal tetap dapat dikirim.
- [ ] RawBT tetap berfungsi di Redmi Pad 2 dan EP58M seperti jalur sebelumnya.
