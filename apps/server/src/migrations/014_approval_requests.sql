-- Persetujuan owner jarak jauh: kasir meminta dari tablet, owner menyetujui/menolak dari dashboard
-- (atau memberi kode sekali pakai yang ikut terkirim di notifikasi). PIN owner tidak perlu dibagikan.
create table if not exists approval_requests (
  id uuid primary key,
  device_id uuid not null references devices(id),
  requested_by uuid references users(id),
  requested_by_name text not null,
  reason text not null,
  -- Kode sekali pakai, berumur pendek. Disimpan apa adanya karena owner perlu melihatnya di dashboard.
  code text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts int not null default 0,
  decided_at timestamptz,
  approved boolean,
  approved_by uuid references users(id),
  via text
);
create index if not exists approval_requests_pending on approval_requests (expires_at) where decided_at is null;
