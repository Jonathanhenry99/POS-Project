// Pengaturan notifikasi WhatsApp (khusus owner). Kunci layanan hanya ditulis, tidak pernah dibaca balik.
import { Router } from 'express';
import { z } from 'zod';
import { need } from '../auth';
import { audit, pool } from '../db';
import { badRequest, notFound, parse } from '../http';
import { DEFAULT_TOGGLES, getToggles, normalizePhone, sendNow } from '../notify';
import { getSettings } from '../repo';

export const notifyRouter = Router();

const MAX_RECIPIENTS = 5;
const recipientCols = 'id, name, phone, active';

notifyRouter.get('/notify', need('admin'), async (_req, res) => {
  const [toggles, recipients, log] = await Promise.all([
    getToggles(),
    pool.query(`select ${recipientCols} from notify_recipients order by created_at`),
    pool.query(
      `select o.id, o.kind, o.body, o.created_at as "createdAt", o.sent_at as "sentAt", o.attempts, o.last_error as "lastError", r.name as "recipientName"
       from notify_outbox o join notify_recipients r on r.id = o.recipient_id order by o.created_at desc limit 10`,
    ),
  ]);
  res.json({ toggles, recipients: recipients.rows, log: log.rows });
});

notifyRouter.put('/notify/toggles', need('admin'), async (req, res) => {
  const b = parse(z.object({ soldOut: z.boolean(), lowStock: z.boolean(), dayClose: z.boolean(), approval: z.boolean(), attendance: z.boolean() }).partial(), req.body);
  const next = { ...DEFAULT_TOGGLES, ...(await getToggles()), ...b };
  await pool.query(`insert into settings (key, value) values ('notify', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  await audit(pool, req.auth.user!.id, 'update', 'notify', null, b);
  res.json(next);
});

const recipientBody = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(8).max(24),
  apikey: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/, 'API key hanya berisi huruf dan angka'),
  active: z.boolean().default(true),
});

function phoneOrThrow(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw badRequest('Nomor WhatsApp tidak valid. Contoh: 628123456789');
  return phone;
}

notifyRouter.post('/notify/recipients', need('admin'), async (req, res) => {
  const b = parse(recipientBody, req.body);
  const phone = phoneOrThrow(b.phone);
  const { rows: count } = await pool.query<{ n: number }>('select count(*)::int as n from notify_recipients');
  if (count[0].n >= MAX_RECIPIENTS) throw badRequest(`Paling banyak ${MAX_RECIPIENTS} penerima`);
  const { rows } = await pool.query(`insert into notify_recipients (name, phone, apikey, active) values ($1,$2,$3,$4) returning ${recipientCols}`, [b.name, phone, b.apikey, b.active]);
  // Kunci tidak disalin ke log audit.
  await audit(pool, req.auth.user!.id, 'create', 'notify-recipient', rows[0].id, { name: b.name, phone });
  res.status(201).json(rows[0]);
});

notifyRouter.patch('/notify/recipients/:id', need('admin'), async (req, res) => {
  const b = parse(recipientBody.partial(), req.body);
  const next = { ...b, ...(b.phone === undefined ? {} : { phone: phoneOrThrow(b.phone) }) };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of ['name', 'phone', 'apikey', 'active'] as const) {
    if (next[k] === undefined) continue;
    vals.push(next[k]);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) throw badRequest('Tidak ada yang diubah');
  vals.push(req.params.id);
  const { rows } = await pool.query(`update notify_recipients set ${sets.join(', ')} where id = $${vals.length} returning ${recipientCols}`, vals);
  if (!rows[0]) throw notFound();
  const { apikey, ...logged } = next;
  await audit(pool, req.auth.user!.id, 'update', 'notify-recipient', String(req.params.id), { ...logged, ...(apikey === undefined ? {} : { apikey: '(diganti)' }) });
  res.json(rows[0]);
});

notifyRouter.delete('/notify/recipients/:id', need('admin'), async (req, res) => {
  const { rowCount } = await pool.query('delete from notify_recipients where id = $1', [req.params.id]);
  if (!rowCount) throw notFound();
  await audit(pool, req.auth.user!.id, 'delete', 'notify-recipient', String(req.params.id));
  res.json({ ok: true });
});

/** Tes kirim: langsung ke layanan (tanpa antrean) supaya owner melihat hasilnya saat itu juga. */
notifyRouter.post('/notify/recipients/:id/test', need('admin'), async (req, res) => {
  const { rows } = await pool.query<{ phone: string; apikey: string; name: string }>('select phone, apikey, name from notify_recipients where id = $1', [req.params.id]);
  if (!rows[0]) throw notFound();
  const s = await getSettings(pool);
  const body = `*Tes notifikasi - ${s.store.name}*\nHalo ${rows[0].name}, pesan dari POS sudah sampai. Kabar stok menipis, menu habis dan ringkasan tutup toko akan masuk ke nomor ini.`;
  const result = await sendNow(rows[0], body);
  await pool.query('insert into notify_outbox (recipient_id, kind, body, sent_at, attempts, last_error) values ($1, $2, $3, $4, 1, $5)', [req.params.id, 'test', body, result.ok ? new Date() : null, result.detail]);
  res.json(result);
});
