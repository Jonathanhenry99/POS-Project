// Absensi karyawan: dicatat dari tablet kasir (PIN + selfie), dilihat owner di back office.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { businessDate, checkLocation, localToUtcIso, clockToMinutes, formatTime, lateLabel, lateMinutes, minutesOfDay, type AttendanceSettings, type GeoPoint, type PublicUser } from '@mourden/shared';
import { need, needDevice, needUser } from '../auth';
import { audit, pool } from '../db';
import { badRequest, dateRangeQuery, forbidden, notFound, parse } from '../http';
import { noticeToOwners } from '../notify';
import { getSettings } from '../repo';
import { attendanceCountFrom, attendanceDuty, OFF_LABEL, recalcAttendance, scheduleToday } from './team';

export const attendanceRouter = Router();

const uuid = z.uuid();
const body = z.object({
  userId: uuid,
  clockedAt: z.iso.datetime(),
  // Selfie dikompres di tablet (JPEG kecil); batas ini menjaga database tetap ringan.
  photo: z.string().max(300_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Foto harus JPEG'),
});

attendanceRouter.put('/tablet/attendance/:id', needDevice, needUser, async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(body, req.body);
  // Operator permintaan ini adalah orang yang memasukkan PIN-nya di tablet; tidak bisa mengabsenkan orang lain.
  if (b.userId !== req.auth.user!.id) throw forbidden('Absen hanya untuk diri sendiri');
  // Jam tablet yang terlalu maju tidak dipercaya; absen offline yang baru terkirim tetap memakai jam tabletnya.
  const clockedAt = new Date(Math.min(new Date(b.clockedAt).getTime(), Date.now())).toISOString();
  const result = await record({ id, user: req.auth.user!, deviceId: req.auth.device!.id, clockedAt, photo: b.photo, source: 'tablet', at: null });
  res.status(result.status === 'created' ? 201 : 200).json(result);
});

const phoneBody = z.object({
  photo: body.shape.photo,
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000) }).nullable(),
});

/**
 * Absen dari HP karyawan (akun barista/kitchen). Jam memakai jam server, bukan jam HP. Bila owner sudah
 * menandai titik toko, absen hanya diterima dari dalam radius toko.
 */
attendanceRouter.put('/me/attendance/:id', needUser, async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(phoneBody, req.body);
  const user = req.auth.user!;
  if (user.role === 'owner') throw badRequest('Owner tidak perlu absen');
  const s = await getSettings(pool);
  const where = checkLocation(s.attendance!, b.location);
  if (where.required && !b.location) throw badRequest('Izinkan akses lokasi untuk absen. Absen hanya bisa dilakukan di toko.');
  if (!where.inside) throw badRequest(`Lokasi Anda sekitar ${formatDistance(where.distanceM!)} dari toko. Absen hanya bisa dilakukan di toko.`);
  const result = await record({ id, user, deviceId: req.auth.device?.id ?? null, clockedAt: new Date().toISOString(), photo: b.photo, source: req.auth.device ? 'tablet' : 'hp', at: b.location, distanceM: where.distanceM });
  res.status(result.status === 'created' ? 201 : 200).json(result);
});

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km` : `${m} m`;
}

/** Status absen hari ini + riwayat 14 hari untuk layar absen di HP karyawan. */
attendanceRouter.get('/me/attendance', needUser, async (req, res) => {
  const s = await getSettings(pool);
  const cfg = s.attendance!;
  const tz = s.store.timezone;
  const today = businessDate(new Date().toISOString(), tz);
  const { rows } = await pool.query(
    `select business_date as date, clocked_at as "clockedAt", late_minutes as "lateMinutes", due_time as "dueTime", source, distance_m as "distanceM"
     from attendance where user_id = $1 and business_date > ($2::date - 14) order by business_date desc`,
    [req.auth.user!.id, today],
  );
  const { shift, off } = await attendanceDuty(pool, req.auth.user!.id, today);
  const done = rows.find((r) => r.date === today) ?? null;
  res.json({
    enabled: cfg.enabled,
    // Yang tidak terjadwal masuk hari ini tidak perlu (dan tidak bisa) absen.
    required: cfg.enabled && req.auth.user!.role !== 'owner' && !off,
    offToday: done ? null : off,
    startTime: shift?.startTime ?? cfg.startTime,
    shiftName: shift?.templateName ?? null,
    graceMinutes: cfg.graceMinutes,
    // Titik toko ikut dikirim supaya HP bisa menunjukkan jaraknya sebelum mengirim; pemeriksaan tetap di server.
    location: { set: cfg.storeLat !== null && cfg.storeLng !== null, radiusM: cfg.radiusM, lat: cfg.storeLat, lng: cfg.storeLng },
    storeName: s.store.name,
    timezone: tz,
    today: done,
    history: rows,
    serverTime: new Date().toISOString(),
  });
});

async function record(r: { id: string; user: PublicUser; deviceId: string | null; clockedAt: string; photo: string; source: 'tablet' | 'hp'; at: GeoPoint | null; distanceM?: number | null }) {
  const s = await getSettings(pool);
  const cfg = s.attendance!;
  if (!cfg.enabled) throw badRequest('Absensi belum diaktifkan owner');
  const tz = s.store.timezone;
  const date = businessDate(r.clockedAt, tz);
  // Absen kedua di hari yang sama tidak menimpa yang pertama; kembalikan yang sudah ada.
  const existing = async () => {
    const { rows: prev } = await pool.query<{ clocked_at: Date; late_minutes: number }>('select clocked_at, late_minutes from attendance where user_id = $1 and business_date = $2', [r.user.id, date]);
    return prev[0] ? { ok: true, status: 'exists' as const, clockedAt: prev[0].clocked_at.toISOString(), lateMinutes: prev[0].late_minutes } : null;
  };
  const before = await existing();
  if (before) return before;
  // Terjadwal hari ini? Telat dihitung dari jam mulai shift-nya (mis. Shift 2 15:00), bukan jam masuk umum.
  // Yang tidak terjadwal masuk (libur/izin/sakit) tidak bisa absen.
  const { shift, off } = await attendanceDuty(pool, r.user.id, date);
  if (off) throw badRequest(`${r.user.name} ${OFF_LABEL[off]} hari ini, jadi tidak perlu absen. Bila menggantikan shift, minta owner menambahkannya di Jadwal.`);
  const due = { startTime: shift?.startTime ?? cfg.startTime, graceMinutes: cfg.graceMinutes };
  const late = lateMinutes(r.clockedAt, tz, due);
  const { rows } = await pool.query<{ id: string }>(
    `insert into attendance (id, user_id, user_name, device_id, business_date, clocked_at, due_time, grace_minutes, late_minutes, photo, photo_mime, source, lat, lng, accuracy_m, distance_m)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'image/jpeg',$11,$12,$13,$14,$15)
     on conflict do nothing returning id`,
    [r.id, r.user.id, r.user.name, r.deviceId, businessDate(r.clockedAt, tz), r.clockedAt, due.startTime, cfg.graceMinutes, late, Buffer.from(r.photo.split(',')[1], 'base64'), r.source, r.at?.lat ?? null, r.at?.lng ?? null, r.at ? Math.round(r.at.accuracy) : null, r.distanceM ?? null],
  );
  if (rows[0] && late > 0) {
    const from = r.source === 'hp' ? ' (dari HP)' : '';
    await noticeToOwners('attendance', 'attendance', async () => `*Absen telat - ${s.store.name}*\n${r.user.name} absen ${formatTime(r.clockedAt, tz)}${from}, ${lateLabel(late).toLowerCase()} dari jam masuk ${due.startTime}${shift ? ` (${shift.templateName})` : ''}.`);
  }
  await attendanceSummaryDue();
  if (!rows[0]) return (await existing()) ?? { ok: true, status: 'exists' as const, clockedAt: r.clockedAt, lateMinutes: late };
  return { ok: true, status: 'created' as const, clockedAt: r.clockedAt, lateMinutes: late };
}

/**
 * Ringkasan harian "siapa sudah/belum absen", dikirim sekali setelah jam masuk lewat.
 * Dipicu oleh sinkron tablet (tiap beberapa menit), jadi tidak butuh penjadwal terpisah.
 */
export async function attendanceSummaryDue() {
  try {
    const s = await getSettings(pool);
    const cfg = s.attendance!;
    if (!cfg.enabled) return;
    const tz = s.store.timezone;
    const now = new Date().toISOString();
    if (minutesOfDay(now, tz) < clockToMinutes(cfg.startTime) + Math.max(0, cfg.graceMinutes)) return;
    const date = businessDate(now, tz);
    // Klaim tanggal ini; permintaan lain yang datang bersamaan tidak ikut mengirim.
    const { rowCount } = await pool.query(
      `insert into settings (key, value) values ('attendance_summary', to_jsonb($1::text))
       on conflict (key) do update set value = excluded.value, updated_at = now() where settings.value <> excluded.value`,
      [date],
    );
    if (!rowCount) return;
    await noticeToOwners('attendance', 'attendance', async () => {
      const [{ rows: staff }, { rows: present }] = await Promise.all([
        pool.query<{ id: string; name: string }>("select id, name from users where active and deleted_at is null and role <> 'owner' order by name"),
        pool.query<{ user_id: string; user_name: string; clocked_at: Date; late_minutes: number }>('select user_id, user_name, clocked_at, late_minutes from attendance where business_date = $1 order by clocked_at', [date]),
      ]);
      const here = new Set(present.map((p) => p.user_id));
      // Ada jadwal shift hari ini: yang ditagih absen hanya yang terjadwal dan shift-nya sudah mulai.
      const scheduled = await scheduleToday(pool, date);
      const nowMin = minutesOfDay(new Date().toISOString(), tz);
      const expected = scheduled.length ? staff.filter((u) => scheduled.some((e) => e.userId === u.id && clockToMinutes(e.startTime) + Math.max(0, cfg.graceMinutes) <= nowMin)) : staff;
      const missing = expected.filter((u) => !here.has(u.id));
      if (!staff.length && !present.length) return null;
      const label = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));
      const parts = [`*Absensi - ${s.store.name}*\n${label}, jam masuk ${cfg.startTime}`];
      if (present.length) parts.push(`Sudah absen (${present.length}):\n${present.map((p) => `- ${p.user_name} ${formatTime(p.clocked_at.toISOString(), tz)}${p.late_minutes ? ` (${lateLabel(p.late_minutes).toLowerCase()})` : ''}`).join('\n')}`);
      parts.push(missing.length ? `Belum absen (${missing.length}):\n${missing.map((u) => `- ${u.name}`).join('\n')}` : 'Semua karyawan sudah absen.');
      return parts.join('\n\n');
    });
  } catch (e) {
    console.error('[attendance]', e);
  }
}

attendanceRouter.get('/attendance', need('admin'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const s = await getSettings(pool);
  const [{ rows: staff }, { rows }, { rows: schedule }] = await Promise.all([
    pool.query("select id, name, role from users where active and deleted_at is null and role <> 'owner' order by name"),
    pool.query(
      `select a.id, a.user_id as "userId", a.user_name as "userName", a.business_date as date, a.clocked_at as "clockedAt", a.received_at as "receivedAt",
         a.due_time as "dueTime", a.late_minutes as "lateMinutes", d.name as "deviceName", a.photo is not null as "hasPhoto",
         a.source, a.distance_m as "distanceM"
       from attendance a left join devices d on d.id = a.device_id
       where a.business_date between $1 and $2 order by a.business_date desc, a.clocked_at`,
      [q.from, q.to],
    ),
    // Jadwal pada rentang ini: menentukan hari kerja tiap orang (yang libur/izin tidak dihitung tidak hadir).
    pool.query(
      `select e.user_id as "userId", to_char(e.date, 'YYYY-MM-DD') as date, e.status
       from schedule_entries e join shift_templates t on t.id = e.template_id
       where e.date between $1 and $2 and t.deleted_at is null`,
      [q.from, q.to],
    ),
  ]);
  const countFrom = await attendanceCountFrom(pool);
  res.json({ settings: s.attendance as AttendanceSettings, timezone: s.store.timezone, today: businessDate(new Date().toISOString(), s.store.timezone), countFrom: countFrom.date, countFromAuto: countFrom.auto, staff, rows, schedule });
});

/**
 * Owner menghitung ulang telat satu absen dari jadwal yang berlaku sekarang (mis. jam masuk di jadwal salah lalu
 * dibetulkan). Jam absen dan selfie tidak berubah; hanya jam masuk acuan dan menit telatnya.
 */
attendanceRouter.post('/attendance/:id/recalc', need('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const r = await recalcAttendance(pool, id);
  if (!r) throw notFound();
  if (r.off) throw badRequest(`${r.userName} ${OFF_LABEL[r.off]} di jadwal tanggal itu. Betulkan jadwalnya dulu, atau hapus absen ini.`);
  if (r.changed) await audit(pool, req.auth.user!.id, 'recalc', 'attendance', id, { before: r.before, after: { dueTime: r.dueTime, lateMinutes: r.lateMinutes } });
  res.json({ ok: true, dueTime: r.dueTime, shiftName: r.shiftName, lateMinutes: r.lateMinutes, changed: r.changed });
});

/**
 * Owner menandai hadir karyawan yang lupa absen (mis. HP mati). Tanpa selfie, jam absen = jam masuk shift-nya (tidak
 * telat), sumber "owner", dan tercatat di log atas nama owner. Gaji hari itu ikut dibayar.
 */
attendanceRouter.post('/attendance/mark', need('admin'), async (req, res) => {
  const b = parse(z.object({ userId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(120).default('') }), req.body);
  const s = await getSettings(pool);
  const cfg = s.attendance!;
  const tz = s.store.timezone;
  if (b.date > businessDate(new Date().toISOString(), tz)) throw badRequest('Tidak bisa menandai hadir untuk tanggal yang belum lewat');
  const { rows: users } = await pool.query<{ name: string; role: string }>('select name, role from users where id = $1 and deleted_at is null', [b.userId]);
  if (!users[0]) throw notFound('Karyawan tidak ditemukan');
  if (users[0].role === 'owner') throw badRequest('Owner tidak perlu absen');
  const { shift, off } = await attendanceDuty(pool, b.userId, b.date);
  if (off) throw badRequest(`${users[0].name} ${OFF_LABEL[off]} di jadwal tanggal itu. Ubah jadwalnya dulu bila ia ternyata masuk.`);
  const due = shift?.startTime ?? cfg.startTime;
  const id = randomUUID();
  const { rowCount } = await pool.query(
    `insert into attendance (id, user_id, user_name, device_id, business_date, clocked_at, due_time, grace_minutes, late_minutes, source)
     values ($1,$2,$3,null,$4,$5,$6,$7,0,'owner') on conflict do nothing`,
    [id, b.userId, users[0].name, b.date, localToUtcIso(`${b.date}T${due}:00`, tz), due, cfg.graceMinutes],
  );
  if (!rowCount) throw badRequest(`${users[0].name} sudah tercatat absen tanggal itu`);
  await audit(pool, req.auth.user!.id, 'mark-present', 'attendance', id, { userId: b.userId, date: b.date, note: b.note });
  res.status(201).json({ ok: true, id, dueTime: due });
});

/** Owner menghapus satu absen (mis. hasil uji): orang itu bisa absen lagi hari itu. */
attendanceRouter.delete('/attendance/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query<{ user_name: string; business_date: string }>('delete from attendance where id = $1 returning user_name, business_date', [parse(uuid, req.params.id)]);
  if (!rows[0]) throw notFound();
  await audit(pool, req.auth.user!.id, 'delete', 'attendance', String(req.params.id), rows[0]);
  res.json({ ok: true });
});

/** Hapus semua absen pada satu tanggal (mis. hari uji coba), supaya semua karyawan bisa absen ulang. */
attendanceRouter.post('/attendance/clear-day', need('admin'), async (req, res) => {
  const b = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  const { rowCount } = await pool.query('delete from attendance where business_date = $1', [b.date]);
  await audit(pool, req.auth.user!.id, 'clear-day', 'attendance', null, { date: b.date, removed: rowCount });
  res.json({ ok: true, removed: rowCount });
});

/** Siapa yang sudah absen hari ini menurut server; tablet memakainya untuk mengikuti absen yang dihapus owner. */
attendanceRouter.get('/tablet/attendance/today', needDevice, async (_req, res) => {
  const s = await getSettings(pool);
  const date = businessDate(new Date().toISOString(), s.store.timezone);
  const { rows } = await pool.query<{ user_id: string }>('select user_id from attendance where business_date = $1', [date]);
  res.json({ date, userIds: rows.map((r) => r.user_id) });
});

attendanceRouter.get('/attendance/:id/photo', need('admin'), async (req, res) => {
  const { rows } = await pool.query<{ photo: Buffer | null; photo_mime: string | null }>('select photo, photo_mime from attendance where id = $1', [parse(uuid, req.params.id)]);
  if (!rows[0]?.photo) throw notFound();
  res.set('Content-Type', rows[0].photo_mime ?? 'image/jpeg').set('Cache-Control', 'private, max-age=86400').send(rows[0].photo);
});
