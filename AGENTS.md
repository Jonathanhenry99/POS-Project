# AGENTS.md: Panduan Membangun POS Cafe

Dokumen ini adalah panduan utama untuk Codex saat membangun sistem POS (Point of Sale) untuk cafe saya. Baca seluruhnya sebelum menulis kode. Jika ada keputusan yang belum jelas, tanya dulu sebelum mengerjakan.

## 1. Tujuan Proyek

Membangun POS web untuk cafe sebagai pengganti ESB. Pengalaman yang diinginkan seperti ESB: kasir menekan **satu tombol** lalu **struk langsung tercetak** di printer thermal, **tanpa dialog cetak browser** (tanpa Ctrl+P / `window.print()`).

## 2. Perangkat di Cafe (Kendala Utama)

| Perangkat | Detail |
|---|---|
| Tablet kasir | Xiaomi Redmi Pad 2 (4GB/128GB), Android (HyperOS), layar tablet, sentuh |
| Printer struk | EPPOS EP58M (seri RPP02), thermal 58 mm, ESC/POS, konektivitas USB + Bluetooth |

Implikasi penting:
- Tablet Android, bukan PC. Fitur `--kiosk-printing` Chrome desktop **tidak berlaku**.
- Printer 58 mm: lebar struk **32 karakter per baris** (font A standar). Semua format struk harus mengikuti batas ini.
- Printer RPP02 kemungkinan besar memakai **Bluetooth klasik (SPP)**, bukan BLE. **Web Bluetooth tidak boleh dijadikan jalur utama** karena kemungkinan besar tidak mendeteksi printer ini. Jangan mengasumsikan; buat jalur cetak yang bisa diganti-ganti (lihat bagian 4).
- RAM 4GB: UI harus ringan. Hindari library berat, animasi berlebihan, dan bundle besar.

## 3. Stack yang Direncanakan (boleh diusulkan perubahan)

- Frontend: React + Vite + TypeScript, dibuat sebagai **PWA** (bisa di-install ke layar utama tablet, tampil fullscreen)
- Backend: Node.js (Express) dengan PostgreSQL
- Styling: Tailwind atau CSS modules, fokus pada tombol besar dan mudah disentuh
- Deploy: bebas, tapi aplikasi harus tetap bisa dipakai kasir saat internet tidak stabil (lihat bagian 7)

Jika ada alasan kuat memilih stack lain, jelaskan dulu dan minta persetujuan.

## 4. Strategi Pencetakan (Bagian Paling Penting)

### 4.1 Prinsip desain: printer driver yang bisa diganti

Buat satu antarmuka printer yang terpisah dari logika bisnis, misalnya:

```ts
interface ReceiptPrinter {
  print(data: Uint8Array): Promise<void>;
  isAvailable(): Promise<boolean>;
}
```

Implementasi yang direncanakan, berurutan berdasarkan prioritas:

1. **RawBTPrinter (jalur utama tahap awal)**
   - Aplikasi **RawBT** (Android) terpasang di tablet dan terpasangkan ke printer lewat Bluetooth (atau USB OTG).
   - Web app membuat data ESC/POS mentah, mengubahnya ke base64, lalu memanggil RawBT lewat URL scheme/intent (`rawbt:base64,...` atau bentuk `intent:` yang didokumentasikan RawBT). Verifikasi format terbaru di dokumentasi RawBT sebelum implementasi.
   - Tujuannya: satu klik, langsung cetak, tanpa dialog browser.
2. **WebUSBPrinter / WebSerial (opsional, eksperimen)**
   - Hanya sebagai cadangan kalau kabel USB OTG dipakai. Tandai sebagai eksperimental.
3. **CapacitorPrinter (opsi jangka panjang)**
   - Jika POS sudah matang, bungkus jadi APK dengan Capacitor dan plugin Bluetooth serial/printer agar tidak butuh aplikasi perantara.
4. **NetworkPrinterBridge (rencana nanti)**
   - Untuk printer dapur/bar via LAN: service Node kecil di jaringan cafe yang menerima job dari app lalu meneruskan ke printer lewat TCP port 9100.
5. **BrowserPrintFallback**
   - `window.print()` hanya sebagai cadangan darurat. Harus jelas terlihat sebagai fallback, bukan alur normal.

Pilihan driver disimpan di pengaturan (tidak di-hardcode), supaya bisa pindah jalur tanpa mengubah kode POS.

### 4.2 Generator struk ESC/POS

- Buat modul terpisah, misalnya `receiptBuilder`, yang menghasilkan byte ESC/POS dari data transaksi. Modul ini harus **murni** (input data, output bytes) agar mudah dites tanpa printer.
- Perintah yang dibutuhkan: inisialisasi (`ESC @`), rata kiri/tengah/kanan, bold, ukuran font, feed baris, potong kertas (`GS V`) jika printer mendukung (banyak model 58 mm tidak punya cutter; sediakan opsi feed beberapa baris saja).
- Lebar 32 karakter: buat helper untuk
  - memotong atau membungkus nama menu panjang,
  - layout dua kolom (nama + harga rata kanan),
  - baris total, subtotal, pajak, diskon, dan kembalian.
- Format angka rupiah: `Rp 25.000` (pemisah titik).
- Gunakan encoding yang aman (CP437/CP858 atau ASCII). Hindari karakter khusus/emoji di struk.
- Logo bitmap hitam-putih: **fase belakangan**, bukan MVP.

### 4.3 Perilaku tombol cetak

- Tombol "Bayar & Cetak" dan "Cetak Ulang" harus berfungsi dengan **satu sentuhan**.
- Tampilkan status jelas: berhasil, gagal, atau printer tidak terdeteksi, dengan tombol "Coba lagi".
- Kegagalan cetak **tidak boleh** membatalkan atau menghilangkan transaksi. Transaksi tetap tersimpan, struk bisa dicetak ulang dari riwayat.
- Sediakan halaman **Tes Printer** di pengaturan (cetak struk contoh 32 karakter) untuk memeriksa koneksi dengan cepat.

## 5. Catatan Khusus Perangkat Xiaomi (HyperOS)

Sertakan di halaman panduan setup dalam aplikasi:
- Matikan optimasi baterai untuk **RawBT** dan **browser/PWA POS** supaya tidak dimatikan sistem di latar belakang.
- Aktifkan Autostart untuk RawBT bila tersedia.
- Pair printer lewat pengaturan Bluetooth Android dulu (PIN umum 0000 atau 1234), baru pilih di RawBT.
- Atur RawBT: lebar kertas 58 mm, lalu jadikan RawBT aplikasi default untuk link `rawbt:` supaya tidak muncul pilihan aplikasi setiap kali.
- Pasang PWA ke layar utama dan kunci orientasi sesuai kebutuhan (landscape disarankan untuk kasir).

## 6. Fitur POS (Urutan Pengerjaan)

**MVP**
1. Login kasir (PIN sederhana) dan peran dasar (kasir, owner)
2. Manajemen menu: kategori, produk, harga, varian/ukuran, add-on
3. Layar kasir: grid menu, keranjang, catatan item, diskon, pajak/service (bisa dimatikan)
4. Pembayaran: tunai (hitung kembalian), QRIS/transfer (tandai manual dulu)
5. Cetak struk satu tombol dan cetak ulang
6. Riwayat transaksi dan pembatalan (void) dengan alasan
7. Laporan harian: total penjualan, per metode bayar, produk terlaris
8. Tutup kasir (rekap kas)

**Tahap berikutnya**
- Stok bahan/inventori sederhana
- Printer dapur/bar (via bridge LAN) dan nomor antrian/meja
- Laporan mingguan/bulanan, ekspor CSV/Excel
- Multi-outlet bila dibutuhkan
- Logo di struk (bitmap)

## 7. Ketahanan Saat Internet Bermasalah

- Pertimbangkan pendekatan **offline-first**: simpan transaksi di IndexedDB lebih dulu, sinkron ke server saat online (idempotent, pakai ID unik dari klien).
- Pencetakan **tidak boleh bergantung pada internet**: struk dibuat di sisi klien lalu dikirim ke printer lokal.
- Cache aset PWA dengan service worker agar aplikasi bisa dibuka tanpa koneksi.

## 8. Aturan UI untuk Tablet

- Target sentuh minimal ~48px, tombol besar, jarak antar tombol cukup.
- Layar utama kasir dalam satu tampilan tanpa banyak scroll: menu di kiri, keranjang di kanan (landscape).
- Cegah zoom tak sengaja dan double-tap; matikan pull-to-refresh di layar kasir.
- Teks berbahasa Indonesia, istilah sederhana.
- Konfirmasi hanya untuk aksi berisiko (void, hapus), bukan untuk aksi rutin.

## 9. Aturan Kerja untuk Codex

- Kerjakan bertahap per fitur dan jelaskan keputusan teknis penting secara singkat.
- Tulis tes untuk `receiptBuilder` (lebar 32 karakter, pembungkusan nama panjang, format rupiah, urutan byte ESC/POS).
- Jangan hardcode jalur printer, ukuran kertas, atau nama toko; semuanya lewat pengaturan.
- Jangan mengklaim "sudah bisa cetak" sebelum diuji di perangkat asli. Beri **checklist uji manual** di perangkat setiap selesai fitur cetak.
- Jangan menyimpan data sensitif (PIN) dalam bentuk teks biasa; gunakan hash.
- Jika ragu soal kompatibilitas printer atau format RawBT, **baca dokumentasi resmi atau tanya saya**, jangan menebak.

## 10. Checklist Uji di Perangkat Asli

- [ ] Printer ter-pair di Bluetooth tablet dan tes cetak dari RawBT berhasil
- [ ] Tombol "Cetak Struk" dari PWA langsung mencetak tanpa dialog apa pun
- [ ] Struk 32 karakter rapi (nama panjang, harga, total, kembalian)
- [ ] Cetak ulang dari riwayat berfungsi
- [ ] Printer mati/disconnect: muncul pesan jelas dan transaksi tetap aman
- [ ] Layar tablet mati lalu dinyalakan: koneksi cetak tetap jalan
- [ ] Aplikasi tetap bisa dipakai saat internet putus
- [ ] Jalur USB OTG sebagai cadangan (opsional)

## 11. Pertanyaan Terbuka (tanyakan ke saya sebelum mulai)

- Apakah pajak/service charge dipakai, dan berapa persen?
- Metode pembayaran yang perlu didukung selain tunai dan QRIS?
- Apakah butuh nomor meja/antrian dan printer dapur dari awal?
- Berapa kasir/perangkat yang akan memakai sistem ini?
- Nama toko, alamat, dan teks footer struk yang dipakai?
