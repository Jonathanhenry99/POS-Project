import { Router } from 'express';
import { z } from 'zod';
import { can, verifyPin, type PublicUser } from '@mourden/shared';
import { checkLock, clearFails, need, needDevice, needUser, newDeviceToken, recordFail, signSession, userColumns } from '../auth';
import { audit, pool, tx } from '../db';
import { HttpError, forbidden, notFound, parse } from '../http';
import { getCatalog, getIngredients, getSettings } from '../repo';

export const authRouter = Router();

const loginBody = z.object({ username: z.string().trim().min(1).max(50), pin: z.string().regex(/^\d{4,6}$/) });

async function checkCredentials(username: string, pin: string, ip: string): Promise<PublicUser> {
  const key = `${username.toLowerCase()}|${ip}`;
  await checkLock(key);
  const { rows } = await pool.query<PublicUser & { pin_hash: string }>(
    `select ${userColumns}, pin_hash from users where lower(username) = lower($1) and active`,
    [username],
  );
  const user = rows[0];
  if (!user || !(await verifyPin(pin, user.pin_hash))) {
    await recordFail(key);
    throw new HttpError(401, 'Username atau PIN salah');
  }
  await clearFails(key);
  const { pin_hash: _, ...pub } = user;
  return pub;
}

authRouter.post('/auth/login', async (req, res) => {
  const body = parse(loginBody, req.body);
  const user = await checkCredentials(body.username, body.pin, req.ip ?? '');
  await audit(pool, user.id, 'login', 'user', user.id);
  res.json({ token: signSession(user.id), user });
});

authRouter.get('/auth/me', needUser, (req, res) => {
  res.json({ user: req.auth.user, device: req.auth.device });
});

// ---------- Perangkat kasir ----------

const pairBody = loginBody.extend({ name: z.string().trim().min(1).max(60) });

/** Owner mengaktifkan tablet sebagai perangkat kasir. Token hanya dikirim sekali. */
authRouter.post('/devices/pair', async (req, res) => {
  const body = parse(pairBody, req.body);
  const user = await checkCredentials(body.username, body.pin, req.ip ?? '');
  if (!can(user.role, 'admin')) throw forbidden('Hanya owner yang bisa mengaktifkan perangkat');
  const { token, hash } = newDeviceToken();
  const device = await tx(async (c) => {
    // Kode perangkat A, B, C, ... dipakai sebagai awalan nomor struk agar tidak bentrok antar-perangkat.
    const { rows: used } = await c.query<{ code: string }>('select code from devices');
    const taken = new Set(used.map((r) => r.code));
    const code = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('').find((c) => !taken.has(c)) ?? `D${taken.size + 1}`;
    const { rows } = await c.query(
      'insert into devices (name, code, token_hash, created_by) values ($1, $2, $3, $4) returning id, name, code',
      [body.name, code, hash, user.id],
    );
    await audit(c, user.id, 'pair', 'device', rows[0].id, { name: body.name });
    return rows[0];
  });
  res.status(201).json({ device, token });
});

authRouter.get('/devices', need('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, code, created_at as "createdAt", last_seen_at as "lastSeenAt", revoked_at as "revokedAt"
     from devices order by created_at desc`,
  );
  res.json(rows);
});

authRouter.post('/devices/:id/revoke', need('admin'), async (req, res) => {
  const { rowCount } = await pool.query('update devices set revoked_at = now() where id = $1 and revoked_at is null', [req.params.id]);
  if (!rowCount) throw notFound('Perangkat tidak ditemukan');
  await audit(pool, req.auth.user!.id, 'revoke', 'device', String(req.params.id));
  res.json({ ok: true });
});

/**
 * Data awal untuk tablet kasir: pengaturan, menu, bahan (untuk opname), dan pengguna + hash PIN
 * supaya kasir tetap bisa login saat internet putus.
 */
authRouter.get('/sync/bootstrap', needDevice, async (req, res) => {
  const [settings, catalog, ingredients, users] = await Promise.all([
    getSettings(pool),
    getCatalog(pool),
    getIngredients(pool),
    pool.query(`select ${userColumns}, pin_hash as "pinHash" from users where active order by name`),
  ]);
  res.json({ device: req.auth.device, settings, catalog, ingredients, users: users.rows, serverTime: new Date().toISOString() });
});
