// Tim: jadwal shift mingguan (dilihat semua karyawan), tarif per shift, kasbon, bonus mingguan, dan slip gaji (owner).
import { Router } from 'express';
import { z } from 'zod';
import {
  addDaysIso,
  bonusWeeksOfMonth,
  businessDate,
  can,
  computePayroll,
  computeWeekBonus,
  DEFAULT_BONUS_TIERS,
  DEFAULT_OVERTIME_RATE,
  monthRange,
  type BonusTier,
  type Kasbon,
  type ScheduleEntry,
  type ShiftTemplate,
} from '@mourden/shared';
import { need } from '../auth';
import { audit, pool, tx, type Db } from '../db';
import { HttpError, badRequest, notFound, parse } from '../http';
import { getTimezone } from '../repo';

export const teamRouter = Router();

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD');
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan harus YYYY-MM');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam harus HH:MM');
const money = z.number().int().min(0).max(1_000_000_000);

// ---------------------------------------------------------------- data

export async function loadTemplates(db: Db = pool, includeInactive = true): Promise<ShiftTemplate[]> {
  const { rows } = await db.query(
    `select t.id, t.name, t.start_time as "startTime", t.end_time as "endTime", t.role, t.sort, t.active,
       coalesce((select json_agg(json_build_object('fee', r.fee, 'effectiveFrom', to_char(r.effective_from, 'YYYY-MM-DD')) order by r.effective_from)
         from shift_rates r where r.template_id = t.id), '[]'::json) as rates
     from shift_templates t where t.deleted_at is null ${includeInactive ? '' : 'and t.active'} order by t.sort, t.start_time, t.name`,
  );
  return rows;
}

async function loadEntries(db: Db, from: string, to: string): Promise<ScheduleEntry[]> {
  const { rows } = await db.query(
    `select e.id, to_char(e.date, 'YYYY-MM-DD') as date, e.template_id as "templateId", e.user_id as "userId", u.name as "userName", e.status, e.note,
       e.start_time as "startTime", e.end_time as "endTime",
       e.overtime_hours::float8 as "overtimeHours", e.overtime_rate as "overtimeRate", e.overtime_note as "overtimeNote"
     from schedule_entries e join users u on u.id = e.user_id join shift_templates t on t.id = e.template_id
     where e.date between $1 and $2 order by e.date, t.sort, u.name`,
    [from, to],
  );
  return rows;
}

/** Jadwal shift hari ini untuk satu orang: jam mulai paling awal (dipakai untuk menghitung telat absen). */
export async function scheduledStart(db: Db, userId: string, date: string): Promise<{ startTime: string; templateName: string } | null> {
  const { rows } = await db.query<{ startTime: string; templateName: string }>(
    `select coalesce(e.start_time, t.start_time) as "startTime", t.name as "templateName" from schedule_entries e join shift_templates t on t.id = e.template_id
     where e.user_id = $1 and e.date = $2 and e.status = 'masuk' order by coalesce(e.start_time, t.start_time) limit 1`,
    [userId, date],
  );
  return rows[0] ?? null;
}

/** Jadwal hari ini untuk semua orang (tablet menghitung telat absen secara lokal, juga saat offline). */
export async function scheduleToday(db: Db, date: string) {
  const { rows } = await db.query<{ userId: string; startTime: string; templateName: string }>(
    `select distinct on (e.user_id) e.user_id as "userId", coalesce(e.start_time, t.start_time) as "startTime", t.name as "templateName"
     from schedule_entries e join shift_templates t on t.id = e.template_id
     where e.date = $1 and e.status = 'masuk' order by e.user_id, coalesce(e.start_time, t.start_time)`,
    [date],
  );
  return rows;
}

async function payrollSettings(db: Db = pool): Promise<{ bonusTiers: BonusTier[]; overtimeRate: number }> {
  const { rows } = await db.query<{ value: { bonusTiers?: BonusTier[]; overtimeRate?: number } }>("select value from settings where key = 'payroll'");
  return { bonusTiers: rows[0]?.value?.bonusTiers ?? DEFAULT_BONUS_TIERS, overtimeRate: rows[0]?.value?.overtimeRate ?? DEFAULT_OVERTIME_RATE };
}

/** Penjualan bersih (setelah diskon, tanpa service & pajak), sama dengan "Penjualan Bersih" di dashboard. */
async function omsetBetween(db: Db, from: string, to: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select coalesce(sum(subtotal - discount_amount), 0)::bigint as n from orders
     where business_date between $1 and $2 and status = 'paid' and comp_employee_id is null`,
    [from, to],
  );
  return Number(rows[0].n);
}

export async function computeMonth(db: Db, month: string) {
  const { from, to } = monthRange(month);
  const weekStarts = bonusWeeksOfMonth(month);
  const rangeFrom = weekStarts[0] && weekStarts[0] < from ? weekStarts[0] : from;
  const [templates, entries, settings, kasbonRows, weekRows, users] = await Promise.all([
    loadTemplates(db),
    loadEntries(db, rangeFrom, to),
    payrollSettings(db),
    db.query<Kasbon>(`select id, user_id as "userId", to_char(date, 'YYYY-MM-DD') as date, amount, note from kasbon where date between $1 and $2 order by date, created_at`, [from, to]),
    db.query<{ weekStart: string; omsetOverride: string | null; disqualified: string[]; note: string }>(
      `select to_char(week_start, 'YYYY-MM-DD') as "weekStart", omset_override as "omsetOverride", disqualified, note from bonus_weeks where week_start = any($1::date[])`,
      [weekStarts],
    ),
    db.query<{ id: string; name: string; role: string }>('select id, name, role from users order by name'),
  ]);
  // Owner boleh tercantum di jadwal (ikut jaga), tetapi tidak digaji dan tidak dihitung dalam pembagian bonus.
  const owners = new Set(users.rows.filter((u) => u.role === 'owner').map((u) => u.id));
  const paid = entries.filter((e) => !owners.has(e.userId));
  const stored = new Map(weekRows.rows.map((w) => [w.weekStart, w]));
  const weeks = await Promise.all(
    weekStarts.map(async (weekStart) => {
      const w = stored.get(weekStart);
      const posOmset = await omsetBetween(db, weekStart, addDaysIso(weekStart, 6));
      return { ...computeWeekBonus({ weekStart, posOmset, omsetOverride: w?.omsetOverride === null || w?.omsetOverride === undefined ? null : Number(w.omsetOverride), disqualified: w?.disqualified ?? [] }, paid, settings.bonusTiers), posOmset, note: w?.note ?? '' };
    }),
  );
  const people = computePayroll({ month, users: users.rows.filter((u) => !owners.has(u.id)), templates, entries: paid, kasbon: kasbonRows.rows, weeks });
  return { month, templates, weeks, people, bonusTiers: settings.bonusTiers, overtimeRate: settings.overtimeRate };
}

// ---------------------------------------------------------------- jadwal (semua karyawan boleh melihat)

/** Jadwal untuk HP karyawan dan tablet kasir. Tarif hanya untuk owner. */
teamRouter.get('/schedule', async (req, res) => {
  if (!req.auth.user && !req.auth.device) throw new HttpError(401, 'Silakan login');
  const q = parse(z.object({ from: isoDate, to: isoDate }), req.query);
  if (q.to < q.from || addDaysIso(q.from, 62) < q.to) throw badRequest('Rentang jadwal maksimal 2 bulan');
  const admin = !!req.auth.user && can(req.auth.user.role, 'admin') && req.auth.verified;
  const [templates, entries] = await Promise.all([loadTemplates(pool, admin), loadEntries(pool, q.from, q.to)]);
  res.json({
    ...(admin ? { aliases: await scheduleAliases() } : {}),
    today: businessDate(new Date().toISOString(), await getTimezone(pool)),
    templates: admin ? templates : templates.map(({ rates: _, ...t }) => ({ ...t, rates: [] })),
    // Karyawan tidak melihat tarif maupun lembur orang lain.
    entries: admin ? entries : entries.map(({ overtimeHours: _h, overtimeRate: _r, overtimeNote: _n, ...e }) => ({ ...e, note: e.status === 'masuk' ? '' : e.note })),
    ...(admin ? { overtimeRate: (await payrollSettings()).overtimeRate } : {}),
    me: req.auth.user?.id ?? null,
  });
});

const entryBody = z.object({
  date: isoDate,
  templateId: uuid,
  userId: uuid,
  status: z.enum(['masuk', 'izin', 'sakit', 'alpa']).default('masuk'),
  note: z.string().trim().max(200).default(''),
  // undefined = jam tidak diubah; null = kembali ke jam shift.
  startTime: clock.nullable().optional(),
  endTime: clock.nullable().optional(),
  // undefined = lembur tidak diubah. Kelipatan 15 menit, maksimal 12 jam.
  overtimeHours: z.number().min(0).max(12).multipleOf(0.25).optional(),
  overtimeNote: z.string().trim().max(200).optional(),
});

teamRouter.put('/schedule/entries', need('admin'), async (req, res) => {
  const b = parse(entryBody, req.body);
  const setTimes = b.startTime !== undefined || b.endTime !== undefined;
  const setOvertime = b.overtimeHours !== undefined;
  // Tarif lembur dibekukan pada catatan ini; perubahan tarif kemudian tidak mengubah gaji yang sudah lewat.
  const rate = setOvertime && b.overtimeHours! > 0 ? (await payrollSettings()).overtimeRate : 0;
  const { rows } = await pool.query(
    `insert into schedule_entries (date, template_id, user_id, status, note, start_time, end_time, overtime_hours, overtime_rate, overtime_note)
     values ($1,$2,$3,$4,$5,$6,$7,$9,$10,$11)
     on conflict (date, template_id, user_id) do update set status = excluded.status, note = excluded.note,
       start_time = case when $8 then excluded.start_time else schedule_entries.start_time end,
       end_time = case when $8 then excluded.end_time else schedule_entries.end_time end,
       overtime_hours = case when $12 then excluded.overtime_hours else schedule_entries.overtime_hours end,
       overtime_rate = case when $12 then (case when excluded.overtime_hours = schedule_entries.overtime_hours and schedule_entries.overtime_rate > 0 then schedule_entries.overtime_rate else excluded.overtime_rate end) else schedule_entries.overtime_rate end,
       overtime_note = case when $12 then excluded.overtime_note else schedule_entries.overtime_note end,
       updated_at = now()
     returning id`,
    [b.date, b.templateId, b.userId, b.status, b.note, b.startTime ?? null, b.endTime ?? null, setTimes, b.overtimeHours ?? 0, rate, b.overtimeNote ?? '', setOvertime],
  );
  await audit(pool, req.auth.user!.id, 'set', 'schedule', rows[0].id, b);
  res.json({ id: rows[0].id });
});

teamRouter.delete('/schedule/entries/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query('delete from schedule_entries where id = $1 returning date, user_id', [parse(uuid, req.params.id)]);
  if (!rows[0]) throw notFound();
  await audit(pool, req.auth.user!.id, 'delete', 'schedule', String(req.params.id), rows[0]);
  res.json({ ok: true });
});

async function scheduleAliases(db: Db = pool): Promise<Record<string, string>> {
  const { rows } = await db.query<{ value: Record<string, string> }>("select value from settings where key = 'schedule_aliases'");
  return rows[0]?.value ?? {};
}

/**
 * Terapkan jadwal hasil "Tempel jadwal" sekaligus. Tanggal di `replaceDates` dikosongkan dulu supaya jadwal lama
 * tidak tercampur. Nama panggilan yang dicocokkan owner diingat untuk tempelan berikutnya.
 */
teamRouter.post('/schedule/import', need('admin'), async (req, res) => {
  const b = parse(
    z.object({
      entries: z.array(z.object({ date: isoDate, templateId: uuid, userId: uuid, startTime: clock.nullable(), endTime: clock.nullable() })).min(1).max(500),
      replaceDates: z.array(isoDate).max(62).default([]),
      aliases: z.record(z.string().trim().toLowerCase().min(1).max(40), uuid).default({}),
    }),
    req.body,
  );
  const created = await tx(async (c) => {
    if (b.replaceDates.length) await c.query('delete from schedule_entries where date = any($1::date[])', [b.replaceDates]);
    let n = 0;
    for (const e of b.entries) {
      const r = await c.query(
        `insert into schedule_entries (date, template_id, user_id, status, note, start_time, end_time) values ($1,$2,$3,'masuk','',$4,$5)
         on conflict (date, template_id, user_id) do update set start_time = excluded.start_time, end_time = excluded.end_time, updated_at = now()`,
        [e.date, e.templateId, e.userId, e.startTime, e.endTime],
      );
      n += r.rowCount ?? 0;
    }
    const merged = { ...(await scheduleAliases(c)), ...b.aliases };
    await c.query(`insert into settings (key, value) values ('schedule_aliases', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(merged)]);
    await audit(c, req.auth.user!.id, 'import', 'schedule', null, { entries: b.entries.length, dates: [...new Set(b.entries.map((e) => e.date))].length, replaced: b.replaceDates.length });
    return n;
  });
  res.status(201).json({ created });
});

/** Salin jadwal satu minggu ke minggu lain (yang sudah ada di minggu tujuan tidak ditimpa). */
teamRouter.post('/schedule/copy-week', need('admin'), async (req, res) => {
  const b = parse(z.object({ from: isoDate, to: isoDate }), req.body);
  const shift = (new Date(`${b.to}T00:00:00Z`).getTime() - new Date(`${b.from}T00:00:00Z`).getTime()) / 86_400_000;
  const { rowCount } = await pool.query(
    `insert into schedule_entries (date, template_id, user_id, status, note, start_time, end_time)
     select e.date + $2::int, e.template_id, e.user_id, 'masuk', '', e.start_time, e.end_time from schedule_entries e
     join users u on u.id = e.user_id and u.active and u.deleted_at is null
     join shift_templates t on t.id = e.template_id and t.active and t.deleted_at is null
     where e.date between $1::date and $1::date + 6
     on conflict (date, template_id, user_id) do nothing`,
    [b.from, shift],
  );
  await audit(pool, req.auth.user!.id, 'copy-week', 'schedule', null, { ...b, copied: rowCount });
  res.json({ copied: rowCount });
});

// ---------------------------------------------------------------- shift & tarif

const templateBody = z.object({ name: z.string().trim().min(1).max(40), startTime: clock, endTime: clock, role: z.enum(['barista', 'kitchen', 'kasir']).nullable().default(null), sort: z.number().int().min(0).max(100).default(0), active: z.boolean().default(true) });

teamRouter.post('/shift-templates', need('admin'), async (req, res) => {
  const b = parse(templateBody.extend({ fee: money, effectiveFrom: isoDate }), req.body);
  const id = await tx(async (c) => {
    const { rows } = await c.query('insert into shift_templates (name, start_time, end_time, role, sort, active) values ($1,$2,$3,$4,$5,$6) returning id', [b.name, b.startTime, b.endTime, b.role, b.sort, b.active]);
    await c.query('insert into shift_rates (template_id, fee, effective_from) values ($1,$2,$3)', [rows[0].id, b.fee, b.effectiveFrom]);
    await audit(c, req.auth.user!.id, 'create', 'shift-template', rows[0].id, b);
    return rows[0].id as string;
  });
  res.status(201).json({ id });
});

teamRouter.patch('/shift-templates/:id', need('admin'), async (req, res) => {
  const b = parse(templateBody.partial(), req.body);
  const cols: Record<string, string> = { name: 'name', startTime: 'start_time', endTime: 'end_time', role: 'role', sort: 'sort', active: 'active' };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(cols)) {
    const v = (b as Record<string, unknown>)[k];
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw badRequest('Tidak ada yang diubah');
  vals.push(parse(uuid, req.params.id));
  const { rowCount } = await pool.query(`update shift_templates set ${sets.join(', ')} where id = $${vals.length} and deleted_at is null`, vals);
  if (!rowCount) throw notFound();
  await audit(pool, req.auth.user!.id, 'update', 'shift-template', String(req.params.id), b);
  res.json({ ok: true });
});

/** Hapus shift dari daftar. Jadwal & gaji lama yang memakainya tetap utuh. */
teamRouter.delete('/shift-templates/:id', need('admin'), async (req, res) => {
  const { rowCount } = await pool.query('update shift_templates set deleted_at = now(), active = false where id = $1 and deleted_at is null', [parse(uuid, req.params.id)]);
  if (!rowCount) throw notFound();
  await audit(pool, req.auth.user!.id, 'delete', 'shift-template', String(req.params.id));
  res.json({ ok: true });
});

/** Tarif baru mulai tanggal tertentu; shift sebelum tanggal itu tetap memakai tarif lama. */
teamRouter.post('/shift-templates/:id/rates', need('admin'), async (req, res) => {
  const b = parse(z.object({ fee: money, effectiveFrom: isoDate }), req.body);
  const id = parse(uuid, req.params.id);
  const { rowCount } = await pool.query(
    `insert into shift_rates (template_id, fee, effective_from) select id, $2, $3 from shift_templates where id = $1 and deleted_at is null
     on conflict (template_id, effective_from) do update set fee = excluded.fee`,
    [id, b.fee, b.effectiveFrom],
  );
  if (!rowCount) throw notFound();
  await audit(pool, req.auth.user!.id, 'set-rate', 'shift-template', id, b);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- kasbon

teamRouter.post('/kasbon', need('admin'), async (req, res) => {
  const b = parse(z.object({ userId: uuid, date: isoDate, amount: z.number().int().min(1).max(100_000_000), note: z.string().trim().max(200).default('') }), req.body);
  const { rows } = await pool.query('insert into kasbon (user_id, date, amount, note, created_by) values ($1,$2,$3,$4,$5) returning id', [b.userId, b.date, b.amount, b.note, req.auth.user!.id]);
  await audit(pool, req.auth.user!.id, 'create', 'kasbon', rows[0].id, b);
  res.status(201).json({ id: rows[0].id });
});

teamRouter.delete('/kasbon/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query('delete from kasbon where id = $1 returning user_id, date, amount', [parse(uuid, req.params.id)]);
  if (!rows[0]) throw notFound();
  await audit(pool, req.auth.user!.id, 'delete', 'kasbon', String(req.params.id), rows[0]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- gaji & bonus

teamRouter.get('/payroll', need('admin'), async (req, res) => {
  const q = parse(z.object({ month: isoMonth }), req.query);
  res.json(await computeMonth(pool, q.month));
});

teamRouter.put('/bonus-weeks/:weekStart', need('admin'), async (req, res) => {
  const weekStart = parse(isoDate, req.params.weekStart);
  if (new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1) throw badRequest('Minggu bonus dimulai hari Senin');
  const b = parse(z.object({ omsetOverride: money.nullable(), disqualified: z.array(uuid).max(100), note: z.string().trim().max(300).default('') }), req.body);
  await pool.query(
    `insert into bonus_weeks (week_start, omset_override, disqualified, note) values ($1,$2,$3,$4)
     on conflict (week_start) do update set omset_override = excluded.omset_override, disqualified = excluded.disqualified, note = excluded.note, updated_at = now()`,
    [weekStart, b.omsetOverride, JSON.stringify(b.disqualified), b.note],
  );
  await audit(pool, req.auth.user!.id, 'set', 'bonus-week', null, { weekStart, ...b });
  res.json({ ok: true });
});

teamRouter.put('/payroll/settings', need('admin'), async (req, res) => {
  const b = parse(z.object({ bonusTiers: z.array(z.object({ min: money, bonus: money })).max(20), overtimeRate: money }).partial(), req.body);
  const cur = await payrollSettings();
  const next = { bonusTiers: [...(b.bonusTiers ?? cur.bonusTiers)].sort((x, y) => x.min - y.min), overtimeRate: b.overtimeRate ?? cur.overtimeRate };
  await pool.query(`insert into settings (key, value) values ('payroll', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  await audit(pool, req.auth.user!.id, 'update', 'payroll-settings', null, b);
  res.json(next);
});

// ---------------------------------------------------------------- slip gaji

/** Buat (atau buat ulang) slip gaji bulan ini untuk semua orang yang punya shift/kasbon/bonus, atau yang dipilih. */
teamRouter.post('/payslips', need('admin'), async (req, res) => {
  const b = parse(z.object({ month: isoMonth, userIds: z.array(uuid).max(100).optional() }), req.body);
  const result = await computeMonth(pool, b.month);
  const store = (await pool.query<{ value: { name: string; address: string } }>("select value from settings where key = 'store'")).rows[0]?.value;
  const people = result.people.filter((p) => !b.userIds || b.userIds.includes(p.userId));
  if (!people.length) throw badRequest('Belum ada shift, kasbon, atau bonus di bulan ini');
  await tx(async (c) => {
    for (const p of people) {
      const data = { ...p, month: b.month, storeName: store?.name ?? '', storeAddress: store?.address ?? '', weeks: result.weeks.filter((w) => w.people[p.userId]).map(({ people: _, ...w }) => w), generatedAt: new Date().toISOString() };
      await c.query(
        `insert into payslips (user_id, month, data, created_by) values ($1,$2,$3,$4)
         on conflict (user_id, month) do update set data = excluded.data, created_by = excluded.created_by, created_at = now()`,
        [p.userId, b.month, JSON.stringify(data), req.auth.user!.id],
      );
    }
    await audit(c, req.auth.user!.id, 'generate', 'payslip', null, { month: b.month, people: people.map((p) => p.name) });
  });
  res.status(201).json({ created: people.length });
});

teamRouter.get('/payslips', need('admin'), async (req, res) => {
  const q = parse(z.object({ month: isoMonth }), req.query);
  const { rows } = await pool.query(
    `select id, user_id as "userId", month, data->>'name' as name, (data->>'takeHome')::bigint as "takeHome", created_at as "createdAt"
     from payslips where month = $1 order by data->>'name'`,
    [q.month],
  );
  res.json(rows.map((r) => ({ ...r, takeHome: Number(r.takeHome) })));
});

teamRouter.get('/payslips/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query('select id, month, data, created_at as "createdAt" from payslips where id = $1', [parse(uuid, req.params.id)]);
  if (!rows[0]) throw notFound();
  res.json(rows[0]);
});

teamRouter.delete('/payslips/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query("delete from payslips where id = $1 returning month, data->>'name' as name", [parse(uuid, req.params.id)]);
  if (!rows[0]) throw notFound();
  await audit(pool, req.auth.user!.id, 'delete', 'payslip', String(req.params.id), rows[0]);
  res.json({ ok: true });
});
