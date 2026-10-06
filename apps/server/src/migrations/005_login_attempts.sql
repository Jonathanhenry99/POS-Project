-- Pembatasan percobaan PIN disimpan di database agar berlaku di semua instance (termasuk serverless).
create table if not exists login_attempts (
  key text primary key,
  fails integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
