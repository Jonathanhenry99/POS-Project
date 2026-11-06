// Shift & hari usaha yang masih terbuka di server: dilihat dan bisa ditutup paksa owner dari back office (mis. owner
// tidak di lokasi), dan dipakai tablet untuk menyamakan diri (melanjutkan shift yang masih terbuka di server alih-alih
// membuka shift kedua, atau ikut menutup shift yang sudah ditutup owner). Tablet juga melaporkan kiriman yang ditolak
// server supaya owner bisa melihat alasannya tanpa memegang tablet.
import { Router } from 'express';
import { z } from 'zod';
import { businessDate, computeBusinessDaySummary, computeShiftSummary, type BusinessDay, type Order, type Shift } from '@mourden/shared';
import { need, needDevice } from '../auth';
import { audit, pool, tx, type Db } from '../db';
import { badRequest, forbidden, notFound, parse } from '../http';
import { getTimezone } from '../repo';
import { asShift, shiftSelect } from './business-days';
import { orderSelect, withItems } from './orders';

export const openStateRouter = Router();

function ownerOnline(req: { auth: { device?: unknown; verified?: boolean; user?: { role: string } | null } }) {
  if (req.auth.device || !req.auth.verified || req.auth.user?.role !== 'owner') throw forbidden('Hanya owner dari HP/laptop yang login online');
}

async function shiftOrders(db: Db, shiftId: string): Promise<Order[]> {
  const { rows } = await db.query(`${orderSelect} where shift_id = $1 order by created_at`, [shiftId]);
  return (await withItems(rows)) as unknown as Order[];
}

const issueKey = (deviceId: string) => `sync_issues:${deviceId}`;

/** Owner: shift & hari usaha yang masih terbuka, rekap sementaranya, dan kiriman tablet yang ditolak. */
openStateRouter.get('/admin/open-state', need('admin'), async (req, res) => {
  ownerOnline(req);
  const [shifts, days, issues] = await Promise.all([
    pool.query(`select s.*, d.name as "deviceName" from (${shiftSelect} where closed_at is null) s left join devices d on d.id = s."deviceId" order by s."openedAt"`),
    pool.query(
      `select b.id, b.business_date::text as "businessDate", b.opened_at as "openedAt", d.name as "deviceName", b.device_id as "deviceId",
         (select count(*)::int from shifts s where s.business_day_id = b.id and s.closed_at is null) as "openShifts"
       from business_days b left join devices d on d.id = b.device_id where b.closed_at is null order by b.opened_at`,
    ),
    pool.query(
      `select d.name as "deviceName", s.value from settings s join devices d on d.id::text = substring(s.key from 13)
       where s.key like 'sync_issues:%' and jsonb_array_length(s.value->'items') > 0`,
    ),
  ]);
  res.json({
    shifts: await Promise.all(
      shifts.rows.map(async (row) => {
        const shift = asShift(row);
        return { ...shift, deviceName: row.deviceName ?? 'Perangkat', liveSummary: computeShiftSummary(shift, await shiftOrders(pool, shift.id)) };
      }),
    ),
    days: days.rows.map((d) => ({ ...d, openedAt: new Date(d.openedAt).toISOString() })),
    issues: issues.rows.map((r) => ({ deviceName: r.deviceName, ...r.value })),
  });
});

const forceBody = z.object({
  countedCash: z.number().int().min(0).max(1_000_000_000).nullable(),
  note: z.string().trim().max(200).default(''),
});

/**
 * Tutup paksa satu shift dari back office. Rekap dihitung server dari transaksi yang sudah masuk; uang tunai yang
 * dihitung diisi owner (boleh kosong bila belum tahu). Hari usaha shift itu ikut ditutup bila tidak ada shift lain yang
 * masih terbuka. Tablet yang memegang shift ini ikut menutupnya saat tersambung.
 */
openStateRouter.post('/admin/shifts/:id/force-close', need('admin'), async (req, res) => {
  ownerOnline(req);
  const b = parse(forceBody, req.body);
  const owner = req.auth.user!;
  const result = await tx(async (c) => {
    const { rows } = await c.query(`${shiftSelect} where id = $1 for update`, [req.params.id]);
    if (!rows[0]) throw notFound('Shift tidak ditemukan');
    const shift = asShift(rows[0]);
    if (shift.closedAt) throw badRequest('Shift ini sudah ditutup');
    const summary = computeShiftSummary(shift, await shiftOrders(c, shift.id));
    const closedAt = new Date().toISOString();
    const note = ['Ditutup paksa owner dari back office', b.note].filter(Boolean).join(': ');
    await c.query(
      `update shifts set closed_by = $2, closed_by_name = $3, closed_at = $4, counted_cash = $5, closing_note = $6, summary = $7,
         close_mode = 'day', updated_at = now() where id = $1 and closed_at is null`,
      [shift.id, owner.id, `${owner.name} (tutup paksa)`, closedAt, b.countedCash, note, JSON.stringify(summary)],
    );
    await audit(c, owner.id, 'force-close', 'shift', shift.id, { countedCash: b.countedCash, note: b.note, netSales: summary.netSales });
    const dayClosed = shift.businessDayId ? await closeDayIfDone(c, shift.businessDayId, owner, closedAt, note) : false;
    return { summary, dayClosed };
  });
  res.json({ ok: true, ...result });
});

/** Tutup paksa hari usaha yang tertinggal terbuka (semua shift-nya sudah ditutup). */
openStateRouter.post('/admin/business-days/:id/force-close', need('admin'), async (req, res) => {
  ownerOnline(req);
  const owner = req.auth.user!;
  const closed = await tx(async (c) => {
    const { rows } = await c.query('select closed_at from business_days where id = $1 for update', [req.params.id]);
    if (!rows[0]) throw notFound('Hari usaha tidak ditemukan');
    if (rows[0].closed_at) throw badRequest('Hari usaha ini sudah ditutup');
    const open = await c.query('select 1 from shifts where business_day_id = $1 and closed_at is null', [req.params.id]);
    if (open.rows.length) throw badRequest('Masih ada shift terbuka di hari ini. Tutup shift-nya dulu.');
    return closeDayIfDone(c, String(req.params.id), owner, new Date().toISOString(), 'Ditutup paksa owner dari back office');
  });
  res.json({ ok: true, dayClosed: closed });
});

async function closeDayIfDone(c: Db, dayId: string, owner: { id: string; name: string }, closedAt: string, note: string): Promise<boolean> {
  const { rows } = await c.query<{ payload: BusinessDay; closed_at: Date | null }>('select payload, closed_at from business_days where id = $1 for update', [dayId]);
  if (!rows[0] || rows[0].closed_at) return false;
  const shifts = (await c.query(`${shiftSelect} where business_day_id = $1 order by opened_at, id`, [dayId])).rows.map(asShift);
  if (shifts.some((s) => !s.closedAt || !s.summary)) return false;
  const day: BusinessDay = {
    ...rows[0].payload,
    closedAt,
    closedById: owner.id,
    closedByName: `${owner.name} (tutup paksa)`,
    closingNote: note.slice(0, 300),
    shiftIds: shifts.map((s) => s.id),
    summary: computeBusinessDaySummary(shifts),
  };
  await c.query('update business_days set closed_at = $2, payload = $3, updated_at = now() where id = $1', [dayId, closedAt, JSON.stringify(day)]);
  await audit(c, owner.id, 'force-close', 'business-day', dayId, { businessDate: day.businessDate });
  return true;
}

/**
 * Tablet: keadaan shift & hari usaha terminal ini di server. `shiftId`/`dayId` = yang sedang aktif di tablet (untuk
 * mengetahui apakah sudah ditutup owner). `open` = shift yang masih terbuka di server untuk terminal ini beserta
 * transaksinya, supaya tablet yang kehilangan data lokalnya bisa melanjutkan shift itu.
 */
openStateRouter.get('/tablet/open-state', needDevice, async (req, res) => {
  const q = parse(z.object({ shiftId: z.uuid().optional(), dayId: z.uuid().optional() }), req.query);
  const deviceId = req.auth.device!.id;
  const [known, knownDay, open] = await Promise.all([
    q.shiftId ? pool.query(`${shiftSelect} where id = $1 and device_id = $2`, [q.shiftId, deviceId]) : null,
    q.dayId ? pool.query('select payload, closed_at from business_days where id = $1 and device_id = $2', [q.dayId, deviceId]) : null,
    pool.query(`${shiftSelect} where device_id = $1 and closed_at is null order by opened_at desc limit 1`, [deviceId]),
  ]);
  let openState: { shift: Shift; day: BusinessDay | null; orders: Order[] } | null = null;
  if (open.rows[0]) {
    const shift = asShift(open.rows[0]);
    const day = shift.businessDayId ? (await pool.query<{ payload: BusinessDay }>('select payload from business_days where id = $1 and closed_at is null', [shift.businessDayId])).rows[0]?.payload ?? null : null;
    openState = { shift, day, orders: await shiftOrders(pool, shift.id) };
  }
  // Nomor struk terakhir terminal ini hari ini (format KODEyymmdd-NNN), supaya tablet tidak mengulang nomor.
  const date = businessDate(new Date().toISOString(), await getTimezone(pool));
  const prefix = `${req.auth.device!.code}${date.slice(2).replace(/-/g, '')}-`;
  const { rows: seq } = await pool.query<{ n: number | null }>(
    `select max(substring(number from $2::int + 1)::int) as n from orders where device_id = $1 and left(number, $2::int) = $3 and substring(number from $2::int + 1) ~ '^[0-9]+$'`,
    [deviceId, prefix.length, prefix],
  );
  res.json({
    lastSeq: seq[0]?.n ? { date, seq: seq[0].n } : null,
    shift: known?.rows[0] ? asShift(known.rows[0]) : null,
    day: knownDay?.rows[0]?.closed_at ? (knownDay.rows[0].payload as BusinessDay) : null,
    open: openState,
  });
});

const issuesBody = z.object({
  items: z
    .array(z.object({ label: z.string().max(80), path: z.string().max(120), error: z.string().max(300), createdAt: z.string().max(40) }))
    .max(50),
});

/** Tablet melaporkan kiriman yang ditolak server (tanpa isi datanya); daftar kosong = sudah beres. */
openStateRouter.put('/tablet/sync-issues', needDevice, async (req, res) => {
  const b = parse(issuesBody, req.body);
  await pool.query(
    `insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [issueKey(req.auth.device!.id), JSON.stringify({ at: new Date().toISOString(), items: b.items })],
  );
  res.json({ ok: true });
});
