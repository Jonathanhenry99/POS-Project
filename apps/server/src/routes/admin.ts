// Pengguna dan pengaturan toko (khusus owner, kecuali baca pengaturan).
import { Router } from 'express';
import { z } from 'zod';
import { hashPin, mergeSettings, verifyPin } from '@mourden/shared';
import { need, needUser, userColumns } from '../auth';
import { audit, pool, tx } from '../db';
import { badRequest, notFound, parse } from '../http';
import { getSettings } from '../repo';

export const adminRouter = Router();

const role = z.enum(['owner', 'kasir', 'barista', 'kitchen']);
const pin = z.string().regex(/^\d{4,6}$/, 'PIN harus 4-6 angka');

adminRouter.get('/users', need('admin'), async (_req, res) => {
  const { rows } = await pool.query(`select ${userColumns} from users order by active desc, name`);
  res.json(rows);
});

adminRouter.post('/users', need('admin'), async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(1).max(60),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'Username 3-30 huruf kecil/angka'),
      role,
      pin,
    }),
    req.body,
  );
  const { rows } = await pool.query(
    `insert into users (name, username, role, pin_hash) values ($1, $2, $3, $4) returning ${userColumns}`,
    [body.name, body.username, body.role, await hashPin(body.pin)],
  );
  await audit(pool, req.auth.user!.id, 'create', 'user', rows[0].id, { username: body.username, role: body.role });
  res.status(201).json(rows[0]);
});

adminRouter.patch('/users/:id', need('admin'), async (req, res) => {
  const body = parse(
    z.object({ name: z.string().trim().min(1).max(60), role, active: z.boolean(), pin: pin.optional() }).partial(),
    req.body,
  );
  const user = await tx(async (c) => {
    const { rows: cur } = await c.query('select id, role, active from users where id = $1 for update', [req.params.id]);
    if (!cur[0]) throw notFound('Pengguna tidak ditemukan');
    const losingOwner = cur[0].role === 'owner' && cur[0].active && (body.active === false || (body.role && body.role !== 'owner'));
    if (losingOwner) {
      const { rows } = await c.query<{ n: number }>("select count(*)::int as n from users where role = 'owner' and active");
      if (rows[0].n <= 1) throw badRequest('Harus ada minimal satu owner aktif');
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (body.name !== undefined) set('name', body.name);
    if (body.role !== undefined) set('role', body.role);
    if (body.active !== undefined) set('active', body.active);
    if (body.pin !== undefined) set('pin_hash', await hashPin(body.pin));
    vals.push(req.params.id);
    const { rows } = await c.query(
      `update users set ${[...sets, 'updated_at = now()'].join(', ')} where id = $${vals.length} returning ${userColumns}`,
      vals,
    );
    await audit(c, req.auth.user!.id, 'update', 'user', String(req.params.id), { ...body, pin: body.pin ? '(diubah)' : undefined });
    return rows[0];
  });
  res.json(user);
});

/** Pengguna mengganti PIN sendiri (perlu PIN lama). */
adminRouter.post('/me/pin', needUser, async (req, res) => {
  const body = parse(z.object({ oldPin: pin, newPin: pin }), req.body);
  const { rows } = await pool.query<{ pin_hash: string }>('select pin_hash from users where id = $1', [req.auth.user!.id]);
  if (!rows[0] || !(await verifyPin(body.oldPin, rows[0].pin_hash))) throw badRequest('PIN lama salah');
  await pool.query('update users set pin_hash = $1, updated_at = now() where id = $2', [await hashPin(body.newPin), req.auth.user!.id]);
  res.json({ ok: true });
});

// ---------- Pengaturan ----------

adminRouter.get('/settings', needUser, async (_req, res) => {
  res.json(await getSettings(pool));
});

const settingsBody = z.object({
  store: z
    .object({
      name: z.string().trim().min(1).max(60),
      address: z.string().max(200),
      phone: z.string().max(40),
      footer: z.string().max(200),
      timezone: z.string().refine((tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'Zona waktu tidak dikenal'),
    })
    .partial(),
  pricing: z
    .object({
      serviceEnabled: z.boolean(),
      servicePct: z.number().min(0).max(100),
      taxEnabled: z.boolean(),
      taxPct: z.number().min(0).max(100),
      taxLabel: z.string().trim().min(1).max(12),
      roundingMode: z.enum(['none', 'down', 'nearest']),
      roundingUnit: z.number().int().min(0).max(1000),
    })
    .partial(),
  policy: z.object({ voidRequiresOwnerPin: z.boolean(), maxCashierDiscountPct: z.number().min(0).max(100) }).partial(),
}).partial();

adminRouter.put('/settings', need('admin'), async (req, res) => {
  const body = parse(settingsBody, req.body);
  const current = await getSettings(pool);
  const next = mergeSettings({
    store: { ...current.store, ...body.store },
    pricing: { ...current.pricing, ...body.pricing },
    policy: { ...current.policy, ...body.policy },
  });
  await tx(async (c) => {
    for (const key of ['store', 'pricing', 'policy'] as const) {
      await c.query(
        `insert into settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(next[key])],
      );
    }
    await audit(c, req.auth.user!.id, 'update', 'settings', null, body);
  });
  res.json(next);
});
