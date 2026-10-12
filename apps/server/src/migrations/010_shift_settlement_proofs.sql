-- Tutup kasir: angka settlement EDC (QRIS, debit/kredit) yang diketik kasir dari struk settlement,
-- dan foto bukti (struk settlement, uang tunai). ID foto dari tablet agar idempotent saat kirim ulang.
alter table shifts add column if not exists settlement jsonb;

create table if not exists shift_proofs (
  id uuid primary key,
  shift_id uuid not null,
  device_id uuid references devices(id),
  kind text not null check (kind in ('edc', 'cash')),
  mime text not null,
  image bytea not null,
  user_id uuid references users(id),
  user_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists shift_proofs_shift_idx on shift_proofs(shift_id);
