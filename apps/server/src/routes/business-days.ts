import { Router } from 'express';
import { z } from 'zod';
import { computeBusinessDaySummary, type BusinessDay, type Shift } from '@mourden/shared';
import { need, needDevice } from '../auth';
import { audit, pool, tx } from '../db';
import { badRequest, dateRangeQuery, parse } from '../http';
import { getTimezone } from '../repo';

export const businessDaysRouter = Router();
const money = z.number().int().nonnegative();
const summarySchema = z.object({
  shiftCount: money, orderCount: money, voidCount: money, voidAmount: money, grossSales: money,
  discountTotal: money, serviceTotal: money, taxTotal: money, netSales: money,
  byMethod: z.object({ cash: money, qris: money, card: money }), cashIn: money, cashOut: money,
  openingCash: money, lastExpectedCash: z.number().int(), lastCountedCash: money.nullable(), cashDifference: z.number().int(),
});
const daySchema = z.object({
  id: z.uuid(), deviceId: z.string(), businessDate: z.iso.date(), openedAt: z.iso.datetime({ offset: true }),
  openedById: z.uuid(), openedByName: z.string().max(60), closedAt: z.iso.datetime({ offset: true }).nullable(),
  closedById: z.uuid().nullable(), closedByName: z.string().max(60), closingNote: z.string().max(300),
  shiftIds: z.array(z.uuid()).max(500), summary: summarySchema.nullable(),
}).superRefine((day, ctx) => {
  if (day.closedAt && (!day.closedById || !day.summary || !day.shiftIds.length)) ctx.addIssue({ code: 'custom', message: 'Rekap penutupan hari belum lengkap' });
  if (!day.closedAt && day.summary) ctx.addIssue({ code: 'custom', message: 'Hari terbuka belum memiliki snapshot penutupan' });
  if (day.closedAt && day.closedAt < day.openedAt) ctx.addIssue({ code: 'custom', message: 'Waktu tutup mendahului buka' });
});

const shiftSelect = `select id, device_id as "deviceId", opened_by as "openedById", opened_by_name as "openedByName",
  opened_at as "openedAt", opening_cash as "openingCash", cash_movements as "cashMovements",
  closed_by as "closedById", closed_by_name as "closedByName", closed_at as "closedAt", counted_cash as "countedCash",
  closing_note as "closingNote", summary, business_day_id as "businessDayId", close_mode as "closeMode" from shifts`;
function asShift(row: Record<string, unknown>): Shift {
  return { ...row, openedAt: (row.openedAt as Date).toISOString(), closedAt: row.closedAt ? (row.closedAt as Date).toISOString() : null } as Shift;
}

/** Idempotent, dibatasi perangkat. Snapshot tertutup tidak ditulis ulang oleh retry/pengguna lain. */
businessDaysRouter.put('/business-days/:id', needDevice, need('pos.shift'), async (req, res) => {
  const day = parse(daySchema, req.body) as BusinessDay;
  if (day.id !== req.params.id) throw badRequest('ID tidak cocok');
  const deviceId = req.auth.device!.id;
  const status = await tx(async (c) => {
    // Semua operasi lifecycle hari baru memakai lock yang sama per terminal.
    await c.query('select id from devices where id = $1 for update', [deviceId]);
    const { rows: prior } = await c.query('select device_id, closed_at, payload from business_days where id = $1 for update', [day.id]);
    if (prior[0] && prior[0].device_id !== deviceId) throw badRequest('Hari usaha bukan milik terminal ini');
    if (prior[0]?.closed_at) return 'closed-unchanged';
    if (prior[0]) {
      const original = prior[0].payload as BusinessDay;
      if (original.openedAt !== day.openedAt || original.businessDate !== day.businessDate || original.openedById !== day.openedById) throw badRequest('Identitas hari usaha tidak boleh berubah');
    }
    if (day.closedAt) {
      const { rows } = await c.query(`${shiftSelect} where business_day_id = $1 and device_id = $2 order by opened_at, id`, [day.id, deviceId]);
      const shifts = rows.map(asShift);
      if (!shifts.length || shifts.some((s) => !s.closedAt || !s.summary)) throw badRequest('Masih ada shift yang belum tersinkron atau ditutup');
      const ids = shifts.map((s) => s.id).sort();
      if (JSON.stringify(ids) !== JSON.stringify([...day.shiftIds].sort())) throw badRequest('Daftar shift belum lengkap');
      // Kegagalan order yang dilewati outbox tidak boleh membuat finalisasi hari tampak berhasil.
      const counts = await c.query(`select shift_id, count(*)::int as count, coalesce(sum(total),0)::bigint as total
        from orders where shift_id = any($1::uuid[]) and device_id = $2 group by shift_id`, [ids, deviceId]);
      for (const shift of shifts) {
        const saved = counts.rows.find((r) => r.shift_id === shift.id);
        const s = shift.summary!;
        if ((saved?.count ?? 0) !== s.orderCount + s.voidCount || Number(saved?.total ?? 0) !== s.netSales + s.voidAmount) throw badRequest('Transaksi shift belum lengkap. Periksa antrean sinkron.');
      }
      const expected = computeBusinessDaySummary(shifts);
      if (Object.keys(expected).some((key) => JSON.stringify(expected[key as keyof typeof expected]) !== JSON.stringify(day.summary![key as keyof typeof expected]))) throw badRequest('Rekap hari tidak sesuai snapshot shift');
    }
    const payload = { ...day, deviceId };
    await c.query(`insert into business_days(id,device_id,business_date,opened_at,closed_at,payload) values($1,$2,$3,$4,$5,$6)
      on conflict(id) do update set closed_at=excluded.closed_at, payload=excluded.payload, updated_at=now()`,
      [day.id, deviceId, day.businessDate, day.openedAt, day.closedAt, JSON.stringify(payload)]);
    await audit(c, req.auth.user!.id, day.closedAt ? 'close' : 'open', 'business-day', day.id, { businessDate: day.businessDate });
    return 'saved';
  });
  res.json({ ok: true, status });
});

/** Historis kasir hanya terminalnya; akses admin existing tetap terpisah. */
businessDaysRouter.get('/tablet/shift-history', needDevice, need('pos.shift'), async (req, res) => {
  const q = parse(dateRangeQuery, req.query);
  const tz = await getTimezone(pool);
  const { rows } = await pool.query(`${shiftSelect} where device_id = $1 and (opened_at at time zone $4)::date between $2 and $3 order by opened_at desc limit 500`, [req.auth.device!.id, q.from, q.to, tz]);
  const days = await pool.query('select payload from business_days where device_id=$1 and business_date between $2 and $3 order by opened_at desc limit 100', [req.auth.device!.id, q.from, q.to]);
  res.json({ shifts: rows.map(asShift), days: days.rows.map((r) => r.payload), limited: rows.length === 500 || days.rows.length === 100 });
});

const printerActionSchema = z.object({
  id: z.uuid(), at: z.iso.datetime({ offset: true }), userName: z.string().max(60),
  profileName: z.string().max(60), driver: z.enum(['rawbt', 'webserial', 'webusb']), outcome: z.enum(['sent', 'failed']),
});
/** Catat perintah laci; 'sent' hanya pengiriman data, bukan bukti laci fisik terbuka. */
businessDaysRouter.post('/tablet/printer-actions/:id', needDevice, need('pos.shift'), async (req, res) => {
  const action = parse(printerActionSchema, req.body);
  if (action.id !== req.params.id) throw badRequest('ID tidak cocok');
  await tx(async (c) => {
    await c.query('select id from devices where id=$1 for update', [req.auth.device!.id]);
    const prior = await c.query("select 1 from audit_log where entity='printer-action' and entity_id=$1", [action.id]);
    if (!prior.rows.length) await audit(c, req.auth.user!.id, 'drawer-command', 'printer-action', action.id,
      { ...action, userName: req.auth.user!.name, deviceId: req.auth.device!.id });
  });
  res.json({ ok: true });
});
