import { Router } from 'express';
import { z } from 'zod';
import { can, hashPassword, passwordProblem, verifyPin, type PublicUser } from '@mourden/shared';
import type { RequestHandler } from 'express';
import { ACCOUNT_LOCK, checkLock, clearFails, need, needDevice, needUser, newDeviceToken, recordFail, signOperator, signSession, userColumns } from '../auth';
import { audit, pool, tx } from '../db';
import { HttpError, badRequest, forbidden, notFound, parse } from '../http';
import { getCatalog, getIngredients, getSettings } from '../repo';
import { attendanceSummaryDue } from './attendance';

export const authRouter = Router();

const secret = {
  pin: z.string().regex(/^\d{4,6}$/).optional(),
  password: z.string().min(1).max(128).optional(),
};
const loginBody = z.object({ username: z.string().trim().min(1).max(50), ...secret }).refine((b) => !!b.pin || !!b.password, 'Isi PIN atau kata sandi');

interface CredentialRow extends PublicUser {
  pin_hash: string;
  password_hash: string | null;
  session_version: number;
}

/**
 * Memeriksa username + PIN/kata sandi. Owner yang sudah punya kata sandi hanya bisa masuk online dengan kata
 * sandi (PIN-nya tetap dipakai di tablet). Percobaan gagal dibatasi per username+IP dan per akun dari IP mana pun.
 */
async function checkCredentials(c: { username: string; pin?: string; password?: string }, ip: string): Promise<{ user: PublicUser; version: number; mustSetPassword: boolean }> {
  const name = c.username.toLowerCase();
  const ipKey = `${name}|${ip}`;
  const acctKey = `acct|${name}`;
  await checkLock(acctKey);
  await checkLock(ipKey);
  const { rows } = await pool.query<CredentialRow>(
    `select ${userColumns}, pin_hash, password_hash, session_version from users where lower(username) = lower($1) and active`,
    [c.username],
  );
  const row = rows[0];
  let ok = false;
  if (row?.role === 'owner' && row.password_hash) ok = !!c.password && (await verifyPin(c.password, row.password_hash));
  else if (row) ok = !!c.pin && (await verifyPin(c.pin, row.pin_hash));
  if (!ok) {
    await recordFail(ipKey);
    if (await recordFail(acctKey, ACCOUNT_LOCK.maxFails, ACCOUNT_LOCK.minutes)) await audit(pool, row?.id ?? null, 'lock', 'user', row?.id ?? null, { username: name });
    throw new HttpError(401, row?.role === 'owner' && row.password_hash && !c.password ? 'Akun owner masuk dengan kata sandi' : 'Username atau PIN/kata sandi salah');
  }
  await clearFails(ipKey);
  await clearFails(acctKey);
  const { pin_hash: _p, password_hash, session_version, ...user } = row!;
  return { user, version: session_version, mustSetPassword: user.role === 'owner' && !password_hash };
}

/** Nama & logo toko untuk layar login (publik: hanya identitas yang memang tercetak di struk). */
authRouter.get('/brand', async (_req, res) => {
  const settings = await getSettings(pool);
  res.set('Cache-Control', 'no-cache');
  res.json({ name: settings.store.name, logo: settings.brand?.logo ?? '' });
});

/** Cara masuk untuk username ini: owner yang sudah punya kata sandi memakai kata sandi, lainnya PIN. */
authRouter.get('/auth/method', async (req, res) => {
  const q = parse(z.object({ username: z.string().trim().min(1).max(50) }), req.query);
  const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from users where lower(username) = lower($1) and active and role = 'owner' and password_hash is not null", [q.username]);
  res.json({ method: rows[0].n ? 'password' : 'pin' });
});

authRouter.post('/auth/login', async (req, res) => {
  const body = parse(loginBody, req.body);
  const { user, version, mustSetPassword } = await checkCredentials(body, req.ip ?? '');
  // Kasir tidak login lewat jalur ini: ia hanya berjualan dari tablet kasir yang diaktifkan owner
  // (PIN kasir dicek di tablet itu, dan server hanya menerima transaksi dari token perangkat aktif).
  if (!can(user.role, 'admin') && !can(user.role, 'stock.opname')) {
    throw forbidden('Akun kasir hanya bisa dipakai di tablet kasir yang sudah diaktifkan owner.');
  }
  await audit(pool, user.id, 'login', 'user', user.id);
  res.json({ token: signSession(user.id, version), user, mustSetPassword });
});

async function bumpSession(userId: string): Promise<number> {
  const { rows } = await pool.query<{ v: number }>('update users set session_version = session_version + 1, updated_at = now() where id = $1 returning session_version as v', [userId]);
  return rows[0].v;
}

function onlyOnline(req: Parameters<RequestHandler>[0]) {
  if (req.auth.device || !req.auth.verified) throw forbidden('Hanya dari HP/laptop yang login online');
}

/**
 * Owner membuat/mengganti kata sandi login online. Kata sandi pertama boleh dibuat tanpa kata sandi lama (owner
 * baru saja masuk dengan PIN). Semua sesi lain berakhir; perangkat ini mendapat sesi baru.
 */
authRouter.post('/auth/password', needUser, async (req, res) => {
  onlyOnline(req);
  const b = parse(z.object({ current: z.string().max(128).optional(), password: z.string().max(128) }), req.body);
  const user = req.auth.user!;
  if (user.role !== 'owner') throw forbidden('Kata sandi hanya untuk akun owner');
  const { rows } = await pool.query<{ password_hash: string | null }>('select password_hash from users where id = $1', [user.id]);
  if (rows[0]?.password_hash && !(b.current && (await verifyPin(b.current, rows[0].password_hash)))) throw badRequest('Kata sandi lama salah');
  const problem = passwordProblem(b.password, user.username);
  if (problem) throw badRequest(problem);
  await pool.query('update users set password_hash = $1 where id = $2', [await hashPassword(b.password), user.id]);
  const version = await bumpSession(user.id);
  await audit(pool, user.id, rows[0]?.password_hash ? 'change-password' : 'set-password', 'user', user.id);
  res.json({ token: signSession(user.id, version) });
});

/** Keluar dari semua perangkat lain (mis. HP hilang). Perangkat ini tetap masuk dengan sesi baru. */
authRouter.post('/auth/logout-all', needUser, async (req, res) => {
  onlyOnline(req);
  const version = await bumpSession(req.auth.user!.id);
  await audit(pool, req.auth.user!.id, 'logout-all', 'user', req.auth.user!.id);
  res.json({ token: signSession(req.auth.user!.id, version) });
});

/**
 * Bukti identitas operator di tablet: PIN dikirim ke server sekali, server memberi token operator berumur 12 jam
 * yang terikat ke tablet ini. Dibutuhkan untuk membuka menu owner di tablet.
 */
authRouter.post('/tablet/operator-token', needDevice, needUser, async (req, res) => {
  const b = parse(z.object({ pin: z.string().regex(/^\d{4,6}$/) }), req.body);
  const user = req.auth.user!;
  const key = `op|${req.auth.device!.id}|${user.id}`;
  await checkLock(key);
  const { rows } = await pool.query<{ pin_hash: string; session_version: number }>('select pin_hash, session_version from users where id = $1 and active', [user.id]);
  if (!rows[0] || !(await verifyPin(b.pin, rows[0].pin_hash))) {
    await recordFail(key);
    throw new HttpError(401, 'PIN salah');
  }
  await clearFails(key);
  res.json({ token: signOperator(user.id, req.auth.device!.id, rows[0].session_version) });
});

/**
 * Lupa kata sandi owner: diatur ulang dari tablet kasir yang aktif, setelah PIN owner dibuktikan ke server
 * (token operator). Butuh akses fisik ke tablet toko + PIN owner, tanpa layanan email/SMS.
 */
authRouter.post('/tablet/owner/password', needDevice, need('admin'), async (req, res) => {
  const b = parse(z.object({ password: z.string().max(128) }), req.body);
  const user = req.auth.user!;
  if (user.role !== 'owner') throw forbidden();
  const problem = passwordProblem(b.password, user.username);
  if (problem) throw badRequest(problem);
  await pool.query('update users set password_hash = $1 where id = $2', [await hashPassword(b.password), user.id]);
  await bumpSession(user.id);
  await audit(pool, user.id, 'reset-password', 'user', user.id, { device: req.auth.device!.name });
  res.json({ ok: true });
});

authRouter.get('/auth/me', needUser, (req, res) => {
  res.json({ user: req.auth.user, device: req.auth.device });
});

// ---------- Perangkat kasir ----------

const pairBody = z.object({ username: z.string().trim().min(1).max(50), ...secret, name: z.string().trim().min(1).max(60) }).refine((b) => !!b.pin || !!b.password, 'Isi PIN atau kata sandi');

/** Owner mengaktifkan tablet sebagai perangkat kasir. Token hanya dikirim sekali. */
authRouter.post('/devices/pair', async (req, res) => {
  const body = parse(pairBody, req.body);
  // Tablet yang aktif menerima hash PIN semua pengguna, jadi aktivasinya memakai kredensial terkuat owner.
  const { user } = await checkCredentials(body, req.ip ?? '');
  if (!can(user.role, 'admin')) throw forbidden('Hanya owner yang bisa mengaktifkan perangkat');
  const { token, hash } = newDeviceToken();
  const { maxDevices } = (await getSettings(pool)).policy;
  const device = await tx(async (c) => {
    // Batasi jumlah tablet kasir aktif (default 1) agar kasir hanya bisa berjualan dari tablet yang ditentukan.
    await c.query('select pg_advisory_xact_lock(724502)');
    const { rows: active } = await c.query<{ name: string }>('select name from devices where revoked_at is null and not is_test order by created_at');
    if (active.length >= maxDevices) {
      throw new HttpError(
        409,
        `Sudah ada ${active.length} tablet kasir aktif (${active.map((d) => d.name).join(', ')}). ` +
          'Cabut dulu di Admin → Pengaturan → Perangkat kasir, atau naikkan batas jumlah tablet di Pengaturan.',
      );
    }
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

/**
 * Perangkat uji owner: dipakai mode "Uji langsung" di pratinjau kasir (HP/laptop owner) supaya transaksi uji
 * benar-benar tersimpan. Hanya owner yang sedang login, tidak memakan jatah tablet kasir, dan tokennya
 * diganti setiap kali diminta (sesi uji lama otomatis tidak berlaku).
 */
authRouter.post('/devices/test', need('admin'), async (req, res) => {
  const { token, hash } = newDeviceToken();
  const device = await tx(async (c) => {
    await c.query('select pg_advisory_xact_lock(724502)');
    const existing = await c.query('update devices set token_hash = $1, revoked_at = null, deleted_at = null where is_test returning id, name, code', [hash]);
    if (existing.rows[0]) return existing.rows[0];
    const { rows: used } = await c.query<{ code: string }>('select code from devices');
    const taken = new Set(used.map((r) => r.code));
    // Awalan nomor struk "U" (uji) bila masih bebas, supaya transaksi uji mudah dikenali.
    const code = ['U', 'T', 'X', 'Z'].find((x) => !taken.has(x)) ?? `U${taken.size + 1}`;
    const { rows } = await c.query(
      "insert into devices (name, code, token_hash, created_by, is_test) values ('Uji owner', $1, $2, $3, true) returning id, name, code",
      [code, hash, req.auth.user!.id],
    );
    await audit(c, req.auth.user!.id, 'pair', 'device', rows[0].id, { name: 'Uji owner', test: true });
    return rows[0];
  });
  res.status(201).json({ device, token });
});

authRouter.get('/devices', need('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, code, is_test as "isTest", created_at as "createdAt", last_seen_at as "lastSeenAt", revoked_at as "revokedAt"
     from devices where deleted_at is null order by created_at desc`,
  );
  res.json(rows);
});

authRouter.post('/devices/:id/revoke', need('admin'), async (req, res) => {
  const { rowCount } = await pool.query('update devices set revoked_at = now() where id = $1 and revoked_at is null', [req.params.id]);
  if (!rowCount) throw notFound('Perangkat tidak ditemukan');
  await audit(pool, req.auth.user!.id, 'revoke', 'device', String(req.params.id));
  res.json({ ok: true });
});

/** Buang perangkat yang sudah dicabut dari daftar. Transaksinya tetap ada dan kode struknya tidak dipakai ulang. */
authRouter.delete('/devices/:id', need('admin'), async (req, res) => {
  const { rows } = await pool.query<{ name: string; code: string; revoked: boolean; deleted: boolean }>(
    'select name, code, revoked_at is not null as revoked, deleted_at is not null as deleted from devices where id = $1',
    [req.params.id],
  );
  if (!rows[0] || rows[0].deleted) throw notFound('Perangkat tidak ditemukan');
  if (!rows[0].revoked) throw badRequest('Cabut akses perangkat ini dulu, baru bisa dihapus dari daftar');
  await pool.query('update devices set deleted_at = now() where id = $1', [req.params.id]);
  await audit(pool, req.auth.user!.id, 'delete', 'device', String(req.params.id), { name: rows[0].name, code: rows[0].code });
  res.json({ ok: true });
});

/**
 * Data awal untuk tablet kasir: pengaturan, menu, bahan (untuk opname), dan pengguna + hash PIN
 * supaya kasir tetap bisa login saat internet putus.
 */
authRouter.get('/sync/bootstrap', needDevice, async (req, res) => {
  // Tablet menyinkron tiap beberapa menit; ini sekaligus menjadi pemicu ringkasan absensi setelah jam masuk.
  await attendanceSummaryDue();
  const [settings, catalog, ingredients, users] = await Promise.all([
    getSettings(pool),
    getCatalog(pool),
    getIngredients(pool),
    pool.query(`select ${userColumns}, pin_hash as "pinHash" from users where active order by name`),
  ]);
  res.json({ device: req.auth.device, settings, catalog, ingredients, users: users.rows, serverTime: new Date().toISOString() });
});
