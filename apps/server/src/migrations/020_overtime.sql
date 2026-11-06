-- Lembur per orang per hari: jam lembur x tarif lembur per jam. Tarif disimpan bersama catatannya supaya
-- perubahan tarif lembur kemudian tidak mengubah gaji yang sudah lewat.
alter table schedule_entries add column if not exists overtime_hours numeric(4,2) not null default 0;
alter table schedule_entries add column if not exists overtime_rate integer not null default 0;
alter table schedule_entries add column if not exists overtime_note text not null default '';
