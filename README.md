# Mourden POS

POS cafe berbasis web (PWA) untuk tablet kasir Android, dengan **cetak struk satu sentuhan tanpa dialog Ctrl+P**.

- **Tablet kasir** (alur ala ESB): Dine In / Take Away, kategori Favorit otomatis, varian & add-on, Promo/diskon, **Simpan / Tersimpan** (tahan pesanan), **Cetak Struk** tagihan sebelum bayar, Bayar & Cetak satu sentuhan, riwayat, void, dan tutup kasir. Tetap jalan walau internet putus.
- **HP owner**: dashboard (KPI vs periode sebelumnya, 5 menu terlaris, analisa otomatis, komposisi), Rangkuman Penjualan, Penjualan Menu, Pembayaran, Batal & Void, Laba Kotor (dari HPP resep), peta jam ramai, ekspor CSV, stok, menu, resep/HPP, pengguna, dan pengaturan.
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
```

Keputusan penting:
- **Offline-first.** Transaksi disimpan dulu di IndexedDB tablet, lalu dikirim ke server lewat antrean. ID transaksi dibuat di tablet, sehingga pengiriman ulang tidak membuat data ganda. Server memeriksa ulang semua angka.
- **Stok berbentuk buku besar.** Semua penjualan, void, barang masuk, barang terbuang, dan opname tercatat sebagai pergerakan. Data ini menjadi dasar fitur alert stok AI berikutnya.
- **PIN disimpan sebagai hash** (PBKDF2). Tablet menyimpan hash agar kasir tetap bisa login saat offline.

## Menjalankan di komputer (development)

Butuh Node.js 22+.

```bash
npm install
npm run dev           # PostgreSQL lokal + server API (port 8787) + web (http://localhost:5180)
```

`npm run dev` otomatis menyalakan PostgreSQL lokal (tanpa install Postgres/Docker; data di `apps/server/.pgdata`) dan mengisi akun default + contoh menu saat database masih kosong. Hentikan dengan Ctrl+C.

Akun contoh **khusus development** (di production akun ini tidak dibuat; lihat bagian Deploy):

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

Panduan lengkap langkah demi langkah, dari deploy sampai hari pertama berjualan: **[docs/go-live.md](docs/go-live.md)**.

Ringkasnya, tablet harus membuka aplikasi lewat **HTTPS** (syarat PWA, login offline, service worker). Dua jalur yang sudah disiapkan, keduanya memakai satu database PostgreSQL (region Singapura):

- **Vercel + Neon** (gratis untuk uji coba non-komersial): `vercel.json` + `npm run build:vercel` menghasilkan web statis dan satu fungsi API di `/api` (region `sin1`).
- **Dockerfile** (Railway, Render, Fly.io, VPS) untuk jualan sungguhan.

Environment variables:

| Environment variable | Isi |
|---|---|
| `NODE_ENV` | `production` (otomatis di Vercel) |
| `DATABASE_URL` | URL PostgreSQL dari hosting |
| `JWT_SECRET` | minimal 32 karakter acak (`openssl rand -hex 32`) |
| `INITIAL_OWNER_PIN` | PIN owner pertama, 6 angka rahasia yang tidak mudah ditebak |
| `INITIAL_OWNER_NAME` / `INITIAL_OWNER_USERNAME` | opsional, default `Owner` / `owner` |

Saat pertama jalan, server membuat tabel dan **hanya satu akun owner** dari `INITIAL_OWNER_PIN`. Tidak ada akun berPIN bawaan dan tidak ada menu contoh. Akun kasir/barista/kitchen dibuat owner di Admin → Hak Akses, dan menu diisi di Admin → Pengaturan Menu. Server menolak start bila `JWT_SECRET` terlalu pendek atau database kosong tanpa `INITIAL_OWNER_PIN`.

Mencoba di tablet sebelum deploy (jaringan Wi-Fi yang sama): buka `chrome://flags/#unsafely-treat-insecure-origin-as-secure` di Chrome tablet, tambahkan `http://<IP-komputer>:5180`, lalu restart Chrome.

## Setup tablet & printer

Panduan lengkap ada **di dalam aplikasi**: Pengaturan printer → Panduan setup. Isinya:
- Pairing EP58M.
- Pengaturan RawBT (58 mm, jadikan default untuk link `rawbt:`).
- Pengaturan baterai/Autostart HyperOS.
- Install PWA dan kunci landscape.

## Checklist uji di perangkat asli

Checklist ini juga tersedia sebagai daftar centang di aplikasi (Pengaturan printer → Panduan setup).

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
