# Mourden POS

POS cafe berbasis web (PWA) untuk tablet kasir Android, dengan **cetak struk satu sentuhan tanpa dialog Ctrl+P**.

- **Tablet kasir**: jualan, struk, riwayat, void, dan tutup kasir. Tetap jalan walau internet putus.
- **HP owner**: laporan penjualan, stok, menu, resep/HPP, pengguna, dan pengaturan.
- **HP barista/kitchen**: stock opname malam, catat barang masuk, dan catat barang terbuang.

## Kenapa web (PWA), bukan aplikasi Android?

Aplikasi ini di-install ke layar utama tablet dan tampil penuh seperti aplikasi biasa. Struk dicetak tanpa dialog browser dengan cara berikut:

1. Tablet menyusun byte **ESC/POS** sendiri (`packages/shared/src/receipt`).
2. Byte dikirim ke aplikasi **RawBT** lewat intent Android:
   `intent:base64,<data>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`
   Format ini mengikuti konektor resmi RawBT.
3. RawBT meneruskan data ke printer EP58M lewat Bluetooth.

Nanti, kalau sudah stabil, kode yang sama bisa dibungkus menjadi APK dengan **Capacitor**, sehingga tidak perlu RawBT lagi.

Jalur cetak dipilih di menu **Printer** di tablet (tidak di-hardcode):

| Jalur | Status |
|---|---|
| RawBT (Bluetooth) | Jalur utama |
| Bluetooth langsung (Web Serial, Chrome Android 137+) | Eksperimen. Tanpa RawBT, belum teruji di EP58M |
| USB OTG (WebUSB) | Eksperimen, cadangan |
| Cetak browser | Darurat (memunculkan dialog) |

> Cetak **belum dianggap jalan** sampai checklist di bawah lulus di tablet & printer asli.

## Struktur

```
packages/shared   Logika murni bersama: hitung total, struk ESC/POS (32 kolom), hash PIN, tipe data
apps/server       Express + PostgreSQL: auth, sinkronisasi transaksi, stok, opname, laporan
apps/web          React + Vite PWA: layar kasir offline-first, admin owner, halaman stok
_mockup-lama      Kode mockup sebelumnya (arsip referensi)
```

Keputusan penting:
- **Offline-first.** Transaksi disimpan dulu di IndexedDB tablet, lalu dikirim ke server lewat antrean. ID transaksi dibuat di tablet, sehingga pengiriman ulang tidak membuat data ganda. Server memeriksa ulang semua angka.
- **Stok berbentuk buku besar.** Semua penjualan, void, barang masuk, barang terbuang, dan opname tercatat sebagai pergerakan. Data ini menjadi dasar fitur alert stok AI berikutnya.
- **PIN disimpan sebagai hash** (PBKDF2). Tablet menyimpan hash agar kasir tetap bisa login saat offline.

## Menjalankan di komputer (development)

Butuh Node.js 22+.

```bash
npm install
npm run db:dev        # Terminal 1: PostgreSQL lokal (tanpa install Postgres/Docker), biarkan terbuka
npm run db:seed       # Sekali saja: akun default + contoh menu/bahan/resep
npm run dev           # Terminal 2: server API (port 8787) + web (http://localhost:5180)
```

Akun default (**segera ganti PIN** di Admin → Pengguna):

| Peran | Username | PIN |
|---|---|---|
| Owner | owner | 123456 |
| Kasir | kasir | 1234 |
| Barista | barista | 1111 |
| Kitchen | kitchen | 2222 |

Langkah pertama di browser: **Jadikan perangkat ini tablet kasir** → login owner → pilih "Kasir 1" → PIN 1234 → buka shift.

Tes & pemeriksaan tipe:

```bash
npm test              # struk ESC/POS, hitung harga, API + database sungguhan, antrean offline tablet
npm run typecheck
```

## Deploy (agar bisa dipakai di cafe)

Tablet harus membuka aplikasi lewat **HTTPS**. Ini syarat untuk mode PWA, login offline, dan service worker. Cara termudah adalah satu layanan Node + satu database PostgreSQL, misalnya di **Railway** atau **Render** (pilih region Singapura):

1. Buat database PostgreSQL (Railway Postgres / Neon / Supabase), lalu salin `DATABASE_URL`.
2. Buat layanan dari repo ini:
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
3. Isi environment variables (lihat `apps/server/.env.example`): `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (teks acak panjang).
4. Saat pertama jalan, server otomatis membuat tabel dan akun default. Menu diisi sendiri lewat Admin → Menu. Untuk contoh menu, jalankan `npm run db:seed` sekali dengan `DATABASE_URL` produksi.
5. Buka alamat `https://...` di Chrome tablet → aktifkan sebagai tablet kasir → install ke layar utama.

Mencoba di tablet sebelum deploy (jaringan Wi-Fi yang sama): buka `chrome://flags/#unsafely-treat-insecure-origin-as-secure` di Chrome tablet, tambahkan `http://<IP-komputer>:5180`, lalu restart Chrome.

## Setup tablet & printer

Panduan lengkap ada **di dalam aplikasi**: Printer → Panduan setup. Isinya:
- Pairing EP58M.
- Pengaturan RawBT (58 mm, jadikan default untuk link `rawbt:`).
- Pengaturan baterai/Autostart HyperOS.
- Install PWA dan kunci landscape.

## Checklist uji di perangkat asli

Checklist ini juga tersedia sebagai daftar centang di aplikasi (Printer → Panduan setup).

- [ ] Printer ter-pair di Bluetooth tablet dan tes cetak dari RawBT berhasil
- [ ] Tombol **Tes printer** langsung mencetak tanpa dialog apa pun
- [ ] Struk 32 karakter rapi: garis angka `1234567890…` pas satu baris, nama panjang terbungkus, harga, total, kembalian
- [ ] **Bayar & Cetak** langsung mencetak struk transaksi
- [ ] Cetak ulang dari Riwayat berfungsi
- [ ] Printer dimatikan → muncul pesan; transaksi tetap ada di Riwayat
- [ ] Layar tablet mati lalu dinyalakan → cetak masih berjalan
- [ ] Internet dimatikan → jualan & cetak tetap jalan, ikon "Offline", data terkirim setelah online
- [ ] Rekap tutup kasir tercetak
- [ ] (Opsional) jalur Bluetooth langsung / USB OTG

Catatan RawBT: dari web tidak bisa diketahui apakah kertas benar-benar keluar. Karena itu aplikasi menampilkan "Struk dikirim ke printer". Status printer yang sebenarnya terlihat di aplikasi RawBT.

## Tahap berikutnya

- Alert stok berbasis AI: prediksi kebutuhan dari pola penjualan dan opname. Data pergerakan stok sudah tersedia.
- Printer dapur/bar via bridge LAN (TCP 9100), nomor antrian/meja.
- Bungkus jadi APK (Capacitor + plugin Bluetooth) bila ingin tanpa RawBT.
- Logo bitmap di struk, split payment, laporan mingguan/bulanan lanjutan.
