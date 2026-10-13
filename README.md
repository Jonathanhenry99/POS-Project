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
- [ ] Logo di struk tercetak utuh, rata tengah, tidak terpotong; jarak ke teks di bawahnya rapi. Bila berantakan: coba ukuran Kecil / ketebalan lain, atau matikan "Cetak logo di struk"
- [ ] (Opsional) jalur Bluetooth langsung / USB OTG

Catatan RawBT: dari web tidak bisa diketahui apakah kertas benar-benar keluar. Karena itu aplikasi menampilkan "Struk dikirim ke printer". Status printer yang sebenarnya terlihat di aplikasi RawBT.

## Back office (owner)

- **Dashboard**: KPI dengan perbandingan periode (hari ini / 7 hari / bulan ini), ringkasan penjualan per jam atau per hari, menu terlaris, pola jam ramai 4 minggu, transaksi terbaru (diperbarui tiap menit), komposisi penjualan, kinerja kasir, peringatan stok, dan ekspor CSV.
- **Target penjualan bulanan** (Pengaturan → Target penjualan): capaian, proyeksi akhir bulan, dan kebutuhan per hari.
- **Analisa Menu** (Laporan): matriks popularitas x margin per porsi (Bintang / Andalan / Potensi / Evaluasi). Akurat bila Resep & HPP sudah diisi.
- **Kinerja Kasir** (Laporan): penjualan, rata-rata bill, diskon, dan void per kasir.

## Pengawasan (anti-kecurangan)

- **Perlu Ditinjau** (Transaksi → Perlu Ditinjau, ringkasan di dashboard): pesanan dihapus / item dikurangi setelah tagihan dicetak, tagihan dicetak ganda, void, diskon ≥ 30%, menu Rp 0 terjual, laci dibuka tanpa transaksi, dan selisih kas tutup shift. Bertingkat risiko, bisa ditandai sudah ditinjau.
- Aktivitas dicatat di tablet dan dikirim lewat antrean offline yang sama dengan transaksi (tetap tercatat saat internet putus).
- **Tutup kasir buta** (Pengaturan → Kebijakan kasir, aktif secara bawaan): kasir menghitung uang laci tanpa melihat angka "seharusnya"; selisih baru tampil setelah terkunci.
- Opname harian hanya menangkap penjualan yang tidak diinput bila **Resep & HPP** sudah diisi.
- **Komplimen karyawan**: dicatat kasir dari layar pembayaran dengan menu asli, PIN penerima, dan jatah harian (lebih dari jatah butuh PIN owner). Nilainya Rp 0, bahannya tetap terpotong lewat resep, dan dilaporkan terpisah dari penjualan/diskon (Laporan → Komplimen Karyawan: siapa mengambil apa).
- **Opname dengan kemasan** (Stok Bahan → ubah bahan): isi bersih per kemasan segel dan berat wadah kosong. Barista mengisi jumlah segel + berat timbangan bahan terbuka bersama wadahnya; sistem menghitung bersihnya (segel × isi + timbangan − wadah). Bahan cair: 1 gr = 1 ml.
- **Hitungan buta**: angka stok sistem tidak dikirim ke akun barista/kitchen (bukan hanya disembunyikan di layar).
- **Selisih Bahan** (Inventori → Selisih Bahan): per bahan, pemakaian tercatat (terjual + komplimen), terbuang yang dicatat, dan selisih opname, dinilai wajar/abnormal terhadap toleransi (bawaan di Pengaturan, khusus per bahan di Stok Bahan).

## Tutup kasir & menu habis

- **Tutup kasir** (menu Ganti Shift / Hari: Akhiri shift atau Tutup toko): satu lembar berisi hitung uang tunai, angka struk settlement EDC (QRIS, debit/kredit), dan foto bukti (struk settlement, uang tunai). Foto dikompres di tablet dan ikut antrean offline. Owner melihat pencocokan fisik/struk vs sistem dan fotonya di Transaksi → Tutup Kasir; selisih settlement masuk Perlu Ditinjau. "Wajib bukti saat tutup kasir" diatur di Pengaturan → Kebijakan kasir.
- **Menu habis**: tombol di toolbar kasir membuka daftar menu dengan sakelar; menu yang habis berlabel HABIS dan tidak bisa dipesan (tekan-lama kartu menu tetap berfungsi sebagai jalan pintas).
- **Opname** dikerjakan dari HP barista/kitchen (login web), bukan dari tablet kasir.

## Notifikasi WhatsApp (stok)

- Diatur owner di **Pengaturan → Notifikasi WhatsApp**: aktifkan nomor di CallMeBot (layanan gratis pihak ketiga, pemakaian pribadi), isi nama, nomor dan API key, lalu **Tes kirim**. Tablet kasir tidak perlu aplikasi atau nomor; pesan dikirim dari server.
- Tiga kabar, masing-masing bisa dimatikan: **bahan menipis/habis** (sekali saat turun ke batas minimum, sekali lagi saat habis, diam sampai stok pulih), **menu ditandai habis** di tablet, dan **ringkasan saat Tutup toko**.
- Pesan masuk antrean di database (`notify_outbox`) dulu; yang gagal dicoba lagi pada kejadian berikutnya (maksimal 5 kali, 12 jam). Kegagalan kirim tidak pernah menggagalkan transaksi/sinkron.
- API key tersimpan di `notify_recipients`, tidak pernah dikirim ke klien, bootstrap tablet, atau log audit. Alamat layanan bisa diganti lewat env `WHATSAPP_API_URL`.
- Kabar bahan per penjualan butuh **Resep & HPP** terisi; tanpa resep, stok hanya berubah lewat opname, barang masuk dan waste.

## Persetujuan owner jarak jauh

- Layar "Persetujuan owner" di tablet (void, diskon di atas batas, komplimen di atas jatah) punya dua jalur: **PIN owner** (di tempat, bisa offline) atau **Minta persetujuan** (owner tidak di tempat, butuh internet).
- Permintaan muncul di atas semua halaman admin owner dengan tombol Setujui/Tolak, dan ikut terkirim ke WhatsApp beserta **kode sekali pakai** yang bisa dibacakan ke kasir. Tablet menunggu dan lanjut sendiri.
- Berlaku 10 menit; kode salah 5 kali membatalkan permintaan; maksimal 6 permintaan per tablet per 10 menit. Semua tercatat di log audit (`approval_requests`).

## Absensi karyawan

- Diaktifkan owner di **Pengaturan → Aturan kasir → Absensi karyawan** (jam masuk + toleransi). Tombol **Absen masuk** lalu muncul di layar login tablet kasir.
- Alur: pilih nama → PIN sendiri → selfie (kamera depan) → tercatat. Disimpan di tablet dulu dan ikut antrean offline; satu absen masuk per orang per hari.
- Telat dihitung dari jam tablet pada zona waktu toko, dengan aturan yang sama di tablet dan server (`packages/shared/src/attendance.ts`). Jam server saat menerima ikut disimpan untuk pembanding.
- Owner melihat rekap dan fotonya di menu **Absensi**. Kabar WhatsApp: tiap absen telat, dan satu ringkasan "sudah/belum absen" setelah jam masuk lewat (dipicu sinkron tablet, tanpa penjadwal).

## Menguji dari HP/laptop owner

- **Pratinjau kasir** (tombol di back office): layar kasir dengan menu asli. Bawaan **simulasi**: tidak ada yang tersimpan, cetak hanya tampil di layar.
- **Uji langsung** (ketuk penanda "Simulasi" di header kasir pratinjau): transaksi, shift, void, komplimen benar-benar tersimpan lewat perangkat uji owner (`devices.is_test`, tidak memakan jatah tablet). Nomor struk berawalan `U` + 2 karakter unik per browser. Cetak tetap hanya di layar; PIN penerima komplimen tidak diminta (hash PIN tidak dikirim ke sesi HP).

## Tahap berikutnya

- Alert stok berbasis AI: prediksi kebutuhan dari pola penjualan dan opname. Data pergerakan stok sudah tersedia.
- Printer dapur/bar via bridge LAN (TCP 9100), nomor antrian/meja.
- Bungkus jadi APK (Capacitor + plugin Bluetooth) bila ingin tanpa RawBT.
- Split payment, laporan mingguan/bulanan lanjutan.
