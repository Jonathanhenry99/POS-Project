-- Jadwal shift karyawan, tarif per shift (berlaku mulai tanggal), kasbon, bonus mingguan, dan slip gaji.
create table if not exists shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time text not null,
  end_time text not null,
  -- Peran yang biasa mengisi shift ini (hanya petunjuk di jadwal): barista, kitchen, kasir, atau null.
  role text,
  sort int not null default 0,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tarif berubah dengan tanggal berlaku, supaya gaji bulan lalu tidak ikut berubah saat tarif dinaikkan.
create table if not exists shift_rates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references shift_templates(id) on delete cascade,
  fee integer not null check (fee >= 0),
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (template_id, effective_from)
);

create table if not exists schedule_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  template_id uuid not null references shift_templates(id),
  user_id uuid not null references users(id),
  -- masuk = dihitung gaji & bonus; izin/sakit/alpa = tidak dihitung.
  status text not null default 'masuk' check (status in ('masuk', 'izin', 'sakit', 'alpa')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (date, template_id, user_id)
);
create index if not exists schedule_entries_date_idx on schedule_entries (date);

create table if not exists kasbon (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  date date not null,
  amount integer not null check (amount > 0),
  note text not null default '',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists kasbon_date_idx on kasbon (date);

-- Per minggu (Senin): omset manual (menimpa omset POS) dan karyawan yang tidak memenuhi syarat bonus.
create table if not exists bonus_weeks (
  week_start date primary key,
  omset_override bigint,
  disqualified jsonb not null default '[]',
  note text not null default '',
  updated_at timestamptz not null default now()
);

-- Slip gaji: salinan perhitungan saat dibuat (tidak ikut berubah bila jadwal/tarif diubah kemudian).
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  month text not null,
  data jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

-- Shift bawaan sesuai jadwal Mourden: dua shift barista dan satu shift kitchen.
insert into shift_templates (name, start_time, end_time, role, sort)
select * from (values ('Shift 1', '09:00', '16:00', 'barista', 0), ('Shift 2', '15:00', '22:00', 'barista', 1), ('Kitchen', '14:00', '21:00', 'kitchen', 2)) v(name, start_time, end_time, role, sort)
where not exists (select 1 from shift_templates);
insert into shift_rates (template_id, fee, effective_from)
select id, case when role = 'kitchen' then 70000 else 75000 end, date '2026-01-01' from shift_templates
where not exists (select 1 from shift_rates);
