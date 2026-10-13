// Persetujuan owner jarak jauh untuk aksi kasir yang biasanya butuh PIN owner (void, diskon besar, komplimen di atas jatah).
import { randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { need, needDevice, userColumns } from '../auth';
import { audit, pool, tx } from '../db';
import { badRequest, notFound, parse } from '../http';
import { approvalRequested } from '../notify';

export const approvalsRouter = Router();

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Batas permintaan per tablet dalam satu jendela waktu, supaya owner tidak dibanjiri. */
const MAX_PER_WINDOW = 6;

interface Row {
  id: string;
  device_id: string;
  reason: string;
  code: string;
  expires_at: Date;
  attempts: number;
  decided_at: Date | null;
  approved: boolean | null;
  approved_by: string | null;
}

type Status = 'pending' | 'approved' | 'rejected' | 'expired';
const statusOf = (r: Row): Status => (r.decided_at ? (r.approved ? 'approved' : 'rejected') : r.expires_at.getTime() <= Date.now() ? 'expired' : 'pending');

async function approver(id: string | null) {
  if (!id) return null;
  const { rows } = await pool.query(`select ${userColumns} from users where id = $1`, [id]);
  return rows[0] ?? null;
}

approvalsRouter.post('/tablet/approvals', needDevice, need('pos.sell'), async (req, res) => {
  const b = parse(z.object({ id: z.uuid(), reason: z.string().trim().min(3).max(300) }), req.body);
  const device = req.auth.device!;
  const user = req.auth.user!;
  const { rows: recent } = await pool.query<{ n: number }>(`select count(*)::int as n from approval_requests where device_id = $1 and created_at > now() - make_interval(mins => $2)`, [device.id, TTL_MINUTES]);
  if (recent[0].n >= MAX_PER_WINDOW) throw badRequest('Terlalu banyak permintaan persetujuan. Tunggu beberapa menit.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { rows } = await pool.query<{ expires_at: Date }>(
    `insert into approval_requests (id, device_id, requested_by, requested_by_name, reason, code, expires_at)
     values ($1,$2,$3,$4,$5,$6, now() + make_interval(mins => $7))
     on conflict (id) do update set id = excluded.id returning expires_at`,
    [b.id, device.id, user.id, user.name, b.reason, code, TTL_MINUTES],
  );
  await audit(pool, user.id, 'request', 'approval', b.id, { reason: b.reason });
  await approvalRequested({ by: user.name, device: device.name, reason: b.reason, code, minutes: TTL_MINUTES });
  res.status(201).json({ id: b.id, expiresAt: rows[0].expires_at });
});

async function own(id: string, deviceId: string): Promise<Row> {
  const { rows } = await pool.query<Row>('select * from approval_requests where id = $1 and device_id = $2', [id, deviceId]);
  if (!rows[0]) throw notFound('Permintaan tidak ditemukan');
  return rows[0];
}

/** Tablet menanyakan hasilnya berkala sampai owner memutuskan atau waktunya habis. */
approvalsRouter.get('/tablet/approvals/:id', needDevice, need('pos.sell'), async (req, res) => {
  const r = await own(String(req.params.id), req.auth.device!.id);
  const status = statusOf(r);
  res.json({ status, approver: status === 'approved' ? await approver(r.approved_by) : null });
});

/** Kode dari owner (dibacakan lewat telepon/WhatsApp). Sekali pakai, salah berulang membatalkan permintaan. */
approvalsRouter.post('/tablet/approvals/:id/redeem', needDevice, need('pos.sell'), async (req, res) => {
  const b = parse(z.object({ code: z.string().regex(/^\d{6}$/, 'Kode 6 angka') }), req.body);
  const result = await tx(async (c) => {
    const { rows } = await c.query<Row>('select * from approval_requests where id = $1 and device_id = $2 for update', [req.params.id, req.auth.device!.id]);
    if (!rows[0]) throw notFound('Permintaan tidak ditemukan');
    const r = rows[0];
    const status = statusOf(r);
    if (status === 'approved') return { status, approvedBy: r.approved_by };
    if (status !== 'pending') return { status, approvedBy: null };
    if (r.attempts >= MAX_ATTEMPTS) return { status: 'rejected' as Status, approvedBy: null };
    if (!timingSafeEqual(Buffer.from(b.code), Buffer.from(r.code))) {
      const left = MAX_ATTEMPTS - r.attempts - 1;
      // Kesempatan habis: permintaan dibatalkan, kasir harus meminta ulang (owner melihat permintaan baru).
      await c.query('update approval_requests set attempts = attempts + 1, decided_at = case when $2 then now() else decided_at end, approved = case when $2 then false else approved end, via = case when $2 then $3 else via end where id = $1', [r.id, left <= 0, 'kode-salah']);
      return { status: left <= 0 ? ('rejected' as Status) : ('pending' as Status), approvedBy: null, wrong: true, left };
    }
    // Kode hanya diketahui owner; persetujuan dicatat atas nama owner aktif pertama.
    const { rows: owners } = await c.query<{ id: string }>("select id from users where role = 'owner' and active order by created_at limit 1");
    await c.query("update approval_requests set decided_at = now(), approved = true, approved_by = $2, via = 'kode' where id = $1", [r.id, owners[0]?.id ?? null]);
    await audit(c, req.auth.user!.id, 'redeem', 'approval', r.id, { reason: r.reason });
    return { status: 'approved' as Status, approvedBy: owners[0]?.id ?? null };
  });
  if ('wrong' in result && result.wrong) throw badRequest(result.left ? `Kode salah. Sisa ${result.left} kali percobaan.` : 'Kode salah berulang kali. Permintaan dibatalkan, minta ulang ke owner.');
  res.json({ status: result.status, approver: result.status === 'approved' ? await approver(result.approvedBy) : null });
});

approvalsRouter.get('/approvals/pending', need('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select a.id, a.reason, a.code, a.requested_by_name as "requestedByName", d.name as "deviceName", a.created_at as "createdAt", a.expires_at as "expiresAt"
     from approval_requests a join devices d on d.id = a.device_id
     where a.decided_at is null and a.expires_at > now() order by a.created_at`,
  );
  res.json(rows);
});

approvalsRouter.post('/approvals/:id/decide', need('admin'), async (req, res) => {
  const b = parse(z.object({ approve: z.boolean() }), req.body);
  const { rows } = await pool.query<{ reason: string }>(
    `update approval_requests set decided_at = now(), approved = $2, approved_by = $3, via = 'dashboard'
     where id = $1 and decided_at is null and expires_at > now() returning reason`,
    [req.params.id, b.approve, req.auth.user!.id],
  );
  if (!rows[0]) throw badRequest('Permintaan ini sudah diputuskan atau waktunya habis');
  await audit(pool, req.auth.user!.id, b.approve ? 'approve' : 'reject', 'approval', String(req.params.id), { reason: rows[0].reason });
  res.json({ ok: true });
});
