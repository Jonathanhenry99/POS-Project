-- Jam khusus per orang per hari (mis. kitchen 14:00-20:30 padahal shift bawaan 14:00-21:00). Null = ikut shift.
alter table schedule_entries add column if not exists start_time text;
alter table schedule_entries add column if not exists end_time text;
