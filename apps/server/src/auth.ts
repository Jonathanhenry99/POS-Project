import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { can, type Permission, type PublicUser, type Role } from '@mourden/shared';
import { config } from './config';
import { pool } from './db';
import { HttpError, forbidden } from './http';

export interface AuthInfo {
  /** Pengguna yang sedang beraksi (dari sesi JWT, atau operator yang login PIN di tablet). */
  user: PublicUser | null;
  /** Terisi bila request berasal dari tablet kasir yang sudah diaktifkan. */
  device: { id: string; name: string; code: string } | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth: AuthInfo;
    }
  }
}

const SESSION_TTL = '30d';

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: SESSION_TTL });
}

export function newDeviceToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const userColumns = 'id, name, username, role, active';

async function loadUser(id: string): Promise<PublicUser | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query<PublicUser>(`select ${userColumns} from users where id = $1 and active`, [id]);
  return rows[0] ?? null;
}

const lastSeenWrites = new Map<string, number>();

/**
 * Membaca kredensial:
 *   Authorization: Bearer <jwt>                          -> sesi pengguna (HP owner/barista)
 *   Authorization: Device <token> + X-Operator: <userId> -> tablet kasir + operator yang login PIN
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  req.auth = { user: null, device: null };
  const header = req.get('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (!value) return next();

  if (scheme === 'Bearer') {
    try {
      const payload = jwt.verify(value, config.jwtSecret) as { sub: string };
      req.auth.user = await loadUser(payload.sub);
      if (!req.auth.user) throw new HttpError(401, 'Akun tidak aktif');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(401, 'Sesi berakhir, silakan login lagi');
    }
  } else if (scheme === 'Device') {
    const { rows } = await pool.query<{ id: string; name: string; code: string }>(
      'select id, name, code from devices where token_hash = $1 and revoked_at is null',
      [hashToken(value)],
    );
    if (!rows[0]) throw new HttpError(401, 'Perangkat belum diaktifkan atau sudah dicabut');
    req.auth.device = rows[0];
    const now = Date.now();
    if ((lastSeenWrites.get(rows[0].id) ?? 0) < now - 60_000) {
      lastSeenWrites.set(rows[0].id, now);
      await pool.query('update devices set last_seen_at = now() where id = $1', [rows[0].id]);
    }
    const operator = req.get('x-operator');
    if (operator) {
      req.auth.user = await loadUser(operator);
      if (!req.auth.user) throw new HttpError(401, 'Operator tidak dikenal atau tidak aktif');
    }
  }
  next();
};

export function need(perm: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth.user) throw new HttpError(401, 'Silakan login');
    if (!can(req.auth.user.role as Role, perm)) throw forbidden();
    next();
  };
}

export function needDevice(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth.device) throw new HttpError(401, 'Hanya untuk perangkat kasir yang sudah diaktifkan');
  next();
}

export function needUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth.user) throw new HttpError(401, 'Silakan login');
  next();
}

// ---------- Pembatasan percobaan PIN (disimpan di database: berlaku di semua instance) ----------

const MAX_FAILS = 5;
const LOCK_MINUTES = 5;

export async function checkLock(key: string) {
  const { rows } = await pool.query<{ locked_until: Date | null }>('select locked_until from login_attempts where key = $1', [key]);
  const until = rows[0]?.locked_until;
  if (until && until.getTime() > Date.now()) {
    const minutes = Math.ceil((until.getTime() - Date.now()) / 60_000);
    throw new HttpError(429, `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`);
  }
}

export async function recordFail(key: string) {
  // Atomik: naikkan hitungan; pada kegagalan ke-5 kunci selama 5 menit lalu mulai hitung dari 0.
  await pool.query(
    `insert into login_attempts (key, fails) values ($1, 1)
     on conflict (key) do update set
       fails = case when login_attempts.fails + 1 >= $2 then 0 else login_attempts.fails + 1 end,
       locked_until = case when login_attempts.fails + 1 >= $2 then now() + make_interval(mins => $3) else login_attempts.locked_until end,
       updated_at = now()`,
    [key, MAX_FAILS, LOCK_MINUTES],
  );
}

export async function clearFails(key: string) {
  await pool.query('delete from login_attempts where key = $1', [key]);
}
