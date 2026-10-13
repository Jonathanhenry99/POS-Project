-- Notifikasi WhatsApp ke owner: penerima (nomor + kunci layanan), antrean pesan, dan status peringatan per bahan.
create table if not exists notify_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  -- Kunci layanan pengirim (CallMeBot). Tidak pernah dikirim balik ke klien dan tidak masuk log audit.
  apikey text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists notify_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references notify_recipients(id) on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text not null default ''
);
create index if not exists notify_outbox_pending on notify_outbox (created_at) where sent_at is null;

-- 0 = aman, 1 = menipis (di bawah/sama dengan minimum), 2 = habis. Pesan hanya dikirim saat tingkatnya naik.
alter table ingredients add column if not exists alert_level smallint not null default 0;

-- Keadaan saat fitur dipasang dianggap sudah diketahui owner (tampil di dashboard), jadi tidak dikirim ulang.
update ingredients i set alert_level = case when s.stock <= 0 then 2 when i.min_stock > 0 and s.stock <= i.min_stock then 1 else 0 end
from (
  select i2.id, coalesce(sum(m.qty), 0) as stock
  from ingredients i2 left join stock_movements m on m.ingredient_id = i2.id
  group by i2.id
) s
where s.id = i.id;
