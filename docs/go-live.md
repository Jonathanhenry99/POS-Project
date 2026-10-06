# Panduan go-live Mourden POS

Urutan langkah dari kode di GitHub sampai dipakai berjualan di cafe. Kerjakan berurutan; setiap tahap punya tanda "selesai bila".

Perkiraan waktu: tahap 1–3 satu hari kerja, tahap 4 satu sampai dua hari uji coba, tahap 5 hari pindah penuh.

---

## Tahap 1 — Online dengan HTTPS (sekali saja)

Tablet wajib membuka POS lewat alamat `https://`. Tanpa HTTPS, login PIN offline, mode aplikasi (PWA), dan service worker tidak berjalan.

### Pilihan A (gratis, untuk uji coba): Vercel + Neon

Cocok untuk Tahap 1–4 (setup, input data, uji coba paralel dengan ESB). **Paket gratis Vercel (Hobby) hanya untuk pemakaian non-komersial**; sebelum POS dipakai berjualan sungguhan, naikkan ke Vercel Pro atau pindah ke Pilihan B. Kode sama, tidak perlu diubah.

Di Vercel, aplikasi berjalan sebagai situs statis + satu fungsi API (`/api`) di region Singapura. Semua sudah diatur oleh `vercel.json` dan `scripts/build-vercel.mjs` di repo.

1. Daftar di **vercel.com** memakai akun GitHub `Jonathanhenry99` (paket Hobby).
2. **Add New → Project →** impor repo `POS-Project`. Biarkan pengaturan build apa adanya (sudah dibaca dari `vercel.json`). Jangan klik Deploy dulu bila Anda bisa mengisi Environment Variables di layar ini; bila tidak, deploy pertama boleh gagal, lanjutkan langkah berikut.
3. Di proyek Vercel: **Storage → Create Database → Neon (Postgres)**, pilih region **Singapore (aws-ap-southeast-1)**, lalu hubungkan ke proyek ini. Vercel otomatis menambahkan `DATABASE_URL`.
4. **Settings → Environment Variables**, tambahkan (untuk environment *Production*):

   | Nama | Isi |
   |---|---|
   | `JWT_SECRET` | 64 karakter acak. Buat di Terminal Mac: `openssl rand -hex 32` |
   | `INITIAL_OWNER_PIN` | PIN owner, **6 angka rahasia**. Bukan 123456/111111/tanggal lahir |
   | `INITIAL_OWNER_NAME` | nama Anda, misalnya `Jonathan` |
   | `INITIAL_OWNER_USERNAME` | username login HP owner, misalnya `jonathan` |

   `DATABASE_URL` sudah terisi dari Neon. `NODE_ENV` tidak perlu diisi.
5. **Deployments → Redeploy** (atau push commit baru). Tunggu status *Ready*.
6. Buka `https://<nama-proyek>.vercel.app/api/health`. Harus tampil `{"ok":true,...}`. Permintaan pertama sedikit lebih lama karena database disiapkan otomatis (tabel + akun owner).
7. Bila region fungsi bukan Singapura (Settings → Functions → Function Region), pilih **Singapore (sin1)** agar cepat ke database Neon.

Bila ada masalah, buka **Deployments → (deploy terbaru) → Logs / Runtime Logs**. Pesan aplikasi berbahasa Indonesia, misalnya `JWT_SECRET terlalu pendek`, `Isi INITIAL_OWNER_PIN`, atau `Database tidak bisa dihubungi`.

Batas paket gratis yang perlu diketahui: Neon Free 0,5 GB data (cukup untuk uji coba dan beberapa bulan transaksi satu cafe); database Neon "tidur" saat lama tidak dipakai dan bangun dalam hitungan detik. Tablet tetap jualan offline selama itu; data terkirim otomatis.

### Pilihan B (berbayar murah, untuk jualan sungguhan): Railway

Satu proyek berisi aplikasi (dari `Dockerfile` di repo) dan database PostgreSQL. Biaya kira-kira mulai sekitar US$5/bulan; cek harga terbaru. Alternatif setara: Render, Fly.io, atau VPS lokal Indonesia dengan Docker. Bila pindah dari Pilihan A, database Neon bisa tetap dipakai (cukup isi `DATABASE_URL` yang sama), jadi data tidak hilang.

Langkah di Railway (nama menu bisa sedikit berbeda dari tulisan ini):

1. Daftar di railway.com memakai akun GitHub `Jonathanhenry99`.
2. **New Project → Deploy from GitHub repo →** pilih `POS-Project`. Railway mendeteksi `Dockerfile` otomatis.
3. Di proyek yang sama: **New → Database → PostgreSQL** (atau pakai `DATABASE_URL` Neon dari Pilihan A).
4. Buka layanan aplikasi → **Variables**, isi `NODE_ENV=production`, `DATABASE_URL` (referensi ke database, biasanya `${{Postgres.DATABASE_URL}}`), serta `JWT_SECRET`, `INITIAL_OWNER_PIN`, `INITIAL_OWNER_NAME`, `INITIAL_OWNER_USERNAME` seperti tabel di Pilihan A.
5. **Settings**: region Singapura, **Healthcheck path** `/api/health`, lalu **Networking → Generate Domain**.
6. Buka `https://alamat-anda/api/health` → `{"ok":true,...}`. Bila gagal, lihat tab **Logs**.

**Selesai bila:** alamat https terbuka di HP, dan login dengan username + PIN owner berhasil.

> Jaga kerahasiaan `JWT_SECRET` dan `INITIAL_OWNER_PIN`. Jangan ditulis di GitHub. Repo ini publik; bila tidak ingin kodenya dilihat orang lain, ubah ke private di GitHub (Vercel dan Railway tetap bisa men-deploy repo private).
>
> Setelah akun owner dibuat, `INITIAL_OWNER_PIN` tidak dipakai lagi. Ganti PIN owner dari aplikasi bila PIN awal pernah dibagikan.

---

## Tahap 2 — Isi data toko (di HP/laptop sebagai owner)

Login di `https://alamat-anda` dengan akun owner, lalu:

1. **Pengaturan**
   - Nama toko, alamat, telepon/Instagram, teks penutup struk, zona waktu.
   - Service 5% sudah aktif. PB1 dimatikan dulu sesuai keputusan awal; bisa dinyalakan kapan saja.
   - Kebijakan: apakah void butuh PIN owner, dan batas diskon kasir.
   - Master meja, catatan cepat, alasan batal, dan station produk (bar/dapur) bila dipakai.
2. **Hak Akses** — buat akun setiap orang dengan PIN masing-masing: kasir, barista, kitchen. Jangan memakai satu akun bersama; riwayat transaksi, void, dan opname mencatat siapa pelakunya.
3. **Pengaturan Menu**
   - Kategori sesuai papan menu.
   - Grup varian/add-on (Ukuran, Suhu, Gula, Tambahan) dengan harga tambahannya.
   - Produk dengan harga dasar dan grup varian yang berlaku. Samakan nama & harga dengan ESB supaya laporan bisa dibandingkan.
4. **Inventori → Stok Bahan** — daftar bahan, satuan, stasiun, stok minimum, harga beli per satuan, dan **stok awal hasil hitung fisik**.
5. **Inventori → Resep & HPP** — takaran bahan per menu (dan per varian, misal Large +80 ml susu). Menu tanpa resep tidak memotong stok dan HPP-nya dianggap 0.

**Selesai bila:** semua menu yang dijual ada dengan harga benar, semua staf punya akun, dan stok awal terisi.

Tidak harus sempurna di hari pertama. Menu dan resep bisa dirapikan sambil berjalan, tapi **harga menu harus benar** sebelum uji coba.

---

## Tahap 3 — Siapkan tablet & printer (di cafe)

Perangkat: Redmi Pad 2 + printer EP58M.

1. Perbarui **Chrome** di Play Store ke versi terbaru.
2. Ikuti panduan di aplikasi: **Pengaturan printer → Panduan setup**. Isinya:
   - pair EP58M lewat Bluetooth Android;
   - pasang dan atur **RawBT** (58 mm, printer terpilih, tes cetak dari RawBT);
   - pengaturan baterai dan Autostart HyperOS untuk RawBT & Chrome.
3. Buka `https://alamat-anda` di Chrome tablet → **Jadikan perangkat ini tablet kasir** → isi username & PIN owner.
4. Chrome menu ⋮ → **Instal aplikasi / Tambahkan ke layar utama**. Selanjutnya buka POS dari ikon tersebut.
5. Kunci rotasi ke landscape.
6. Login sebagai kasir → buka shift → menu **Pengaturan printer** → **Tes printer**.
7. Kerjakan **checklist uji perangkat** (Pengaturan printer → Panduan setup) sampai semua tercentang:
   - [ ] Tes cetak dari RawBT berhasil
   - [ ] Tombol Tes printer langsung mencetak tanpa dialog
   - [ ] Garis angka `1234567890…` pas satu baris (32 karakter)
   - [ ] Bayar & Cetak langsung mencetak struk
   - [ ] Cetak ulang dari Riwayat berfungsi
   - [ ] Printer dimatikan → muncul pesan, transaksi tetap ada di Riwayat
   - [ ] Layar tablet mati lalu nyala → cetak masih jalan
   - [ ] Wi-Fi dimatikan → tetap bisa jualan & cetak; setelah Wi-Fi nyala, antrean terkirim (ikon kembali "Online")
   - [ ] Rekap tutup kasir tercetak

Saat pertama menekan cetak, Android mungkin bertanya aplikasi mana yang dipakai. Pilih **RawBT → Selalu**.

**Selesai bila:** semua checklist tercentang di tablet & printer asli. Jika ada butir yang gagal, catat butirnya dan apa yang terlihat di layar, lalu laporkan untuk diperbaiki sebelum lanjut.

---

## Tahap 4 — Uji coba paralel dengan ESB (1–2 hari)

Tujuannya membuktikan angka Mourden sama dengan ESB sebelum ESB dilepas.

1. Selama jam buka, setiap pesanan dimasukkan ke **Mourden dan ESB**. Struk untuk pelanggan dari Mourden.
2. Akhir hari:
   - Mourden: **Ganti Shift / Hari → Tutup Toko / Hari** (hitung uang laci), lalu bandingkan dengan rekap ESB.
   - Admin → **Laporan → Rangkuman Penjualan**: Total Penjualan, Diskon, Service, dan per metode bayar harus sama dengan ESB.
   - Selisih apa pun dicatat (nomor struk, item, nominal) untuk diperiksa.
3. Malam: barista/kitchen melakukan **stock opname** dari HP masing-masing. Owner melihat selisih di Dashboard.

**Selesai bila:** dua hari berturut-turut total harian & per metode bayar sama dengan ESB, dan tidak ada transaksi "gagal sinkron" di menu Sinkronisasi.

---

## Tahap 5 — Pindah penuh

1. Hentikan input di ESB. Simpan ekspor laporan ESB terakhir sebagai arsip.
2. Ganti **PIN owner** bila PIN awal pernah dibagikan.
3. Pastikan backup database aktif (lihat bawah).

### Rutinitas harian

| Waktu | Siapa | Apa |
|---|---|---|
| Buka toko | Kasir | Login PIN → buka shift dengan modal awal → Tes printer bila perlu |
| Selama jualan | Kasir | Bayar & Cetak; Simpan untuk pelanggan yang belum bayar; void selalu dengan alasan |
| Ganti kasir | Kasir | Ganti Shift / Hari → Akhiri Shift (hitung laci) → kasir berikutnya buka shift |
| Tutup toko | Kasir | Ganti Shift / Hari → Tutup Toko / Hari → cetak rekap → serahkan uang + struk rekap |
| Malam | Barista/Kitchen | Stock opname dari HP |
| Kapan saja | Owner | Dashboard & laporan dari HP; cek peringatan stok |

---

## Backup & keamanan

- **Backup database:** aktifkan fitur backup PostgreSQL di hosting (Railway/Neon/Render menyediakannya; cek paket yang dipakai). Uji sekali bahwa backup bisa dipulihkan. Data transaksi juga tersimpan sementara di tablet, tapi itu bukan backup.
- **PIN:** setiap orang memakai PIN sendiri. Staf keluar → nonaktifkan akunnya di Hak Akses.
- **Tablet hilang/diganti:** Admin → Pengaturan → Perangkat kasir → **Cabut**, lalu aktifkan tablet baru.
- **Update aplikasi:** setiap push ke `main` akan di-deploy ulang hosting. Tablet menampilkan tombol **Perbarui**; tekan saat sepi (bukan di tengah transaksi).

## Bila ada masalah

| Gejala | Cek |
|---|---|
| Struk tidak keluar | Printer menyala & kertas ada → buka RawBT, lihat status → Pengaturan printer → Tes printer → Coba lagi. Transaksi tetap aman di Riwayat. |
| Ikon "Offline" / angka antre | Normal saat internet putus. Jualan jalan terus; data terkirim otomatis saat online. |
| "Gagal sinkron" | Menu Sinkronisasi → lihat pesan → kirim ulang. Laporkan bila tetap gagal. |
| Lupa PIN kasir | Owner → Hak Akses → ubah PIN. |
| Lupa PIN owner | Owner lain bisa mengganti. Bila hanya satu owner, perlu bantuan teknis lewat database. Simpan PIN owner dengan aman. |
