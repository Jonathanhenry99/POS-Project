-- Absensi karyawan dari tablet kasir: PIN sendiri + selfie. Satu absen masuk per orang per hari.
create table if not exists attendance (
  id uuid primary key,
  user_id uuid not null references users(id),
  user_name text not null,
  device_id uuid references devices(id),
  business_date date not null,
  -- Waktu menurut tablet (absen bisa dibuat offline) dan waktu diterima server, untuk dibandingkan bila perlu.
  clocked_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- Jam masuk & toleransi yang berlaku saat itu, supaya riwayat tidak berubah bila pengaturannya diganti.
  due_time text not null,
  grace_minutes int not null default 0,
  late_minutes int not null default 0,
  photo bytea,
  photo_mime text,
  unique (user_id, business_date)
);
create index if not exists attendance_date_idx on attendance (business_date);
