// Mengosongkan data penjualan uji (owner). Hanya transaksi dan buka/tutup toko yang dihapus; pengaturan, menu,
// resep, bahan, pengguna, opname, absensi dan log keamanan tetap. Tablet yang datanya dari sebelum reset
// dikenali lewat "versi data" dan membersihkan salinan lokalnya sendiri, supaya transaksi uji tidak terkirim ulang.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { verifyPin } from '@mourden/shared';
import { checkLock, clearFails, need, needUser, recordFail } from '../auth';
import { audit, pool, tx, type Db } from '../db';
import { HttpError, forbidden, parse } from '../http';
import { stockChanged } from '../notify';

export const maintenanceRouter = Router();

/** Tabel penjualan & buka/tutup toko, urut aman untuk dihapus. */
const SALES_TABLES = ['review_marks', 'cashier_events', 'approval_requests', 'shift_proofs', 'order_items', 'orders', 'shifts', 'business_days'] as const;

export interface DataEpoch {
  id: string;
  at: string;
}

export async function currentEpoch(db: Db = pool): Promise<DataEpoch | null> {
  const { rows } = await db.query<{ value: DataEpoch }>("select value from settings where key = 'data_epoch'");
  return rows[0]?.value ?? null;
}

function ownerOnline(req: Parameters<Parameters<typeof maintenanceRouter.get>[1]>[0]) {
  if (req.auth.device || !req.auth.verified || req.auth.user?.role !== 'owner') throw forbidden('Hanya owner dari HP/laptop yang login online');
}

async function counts(db: Db) {
  const { rows } = await db.query<Record<string, number>>(
    `select (select count(*)::int from orders) as orders, (select count(*)::int from orders where status = 'void') as voids,
       (select coalesce(sum(total), 0)::bigint from orders where status = 'paid') as total,
       (select count(*)::int from shifts) as shifts, (select count(*)::int from business_days) as days,
       (select count(*)::int from stock_movements where ref_type = 'order') as "stockMovements"`,
  );
  return rows[0];
}

/** Versi data saat ini, untuk pratinjau "Uji langsung" owner (tablet sungguhan menerimanya lewat bootstrap). */
maintenanceRouter.get('/data-epoch', needUser, async (_req, res) => {
  res.json({ id: (await currentEpoch())?.id ?? null });
});

/** Ringkasan sebelum mengosongkan: berapa data yang akan hilang dan shift yang masih terbuka. */
maintenanceRouter.get('/admin/reset-sales', need('admin'), async (req, res) => {
  ownerOnline(req);
  const { rows: open } = await pool.query(
    `select s.opened_by_name as "openedByName", s.opened_at as "openedAt", d.name as "deviceName"
     from shifts s left join devices d on d.id = s.device_id where s.closed_at is null order by s.opened_at`,
  );
  res.json({ counts: await counts(pool), openShifts: open, lastReset: await currentEpoch() });
});

/** Cadangan JSON data yang akan dihapus (tanpa foto bukti), diunduh otomatis sebelum mengosongkan. */
maintenanceRouter.get('/admin/backup/sales', need('admin'), async (req, res) => {
  ownerOnline(req);
  const tables: Record<string, unknown[]> = {};
  for (const t of SALES_TABLES) {
    const cols = t === 'shift_proofs' ? 'id, shift_id, device_id, kind, mime, user_id, user_name, created_at' : '*';
    tables[t] = (await pool.query(`select ${cols} from ${t}`)).rows;
  }
  tables.stock_movements = (await pool.query("select * from stock_movements where ref_type = 'order'")).rows;
  res.set('Content-Disposition', `attachment; filename="cadangan-penjualan-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exportedAt: new Date().toISOString(), note: 'Cadangan data penjualan & buka/tutup toko sebelum dikosongkan (foto bukti tidak disertakan).', tables });
});

maintenanceRouter.post('/admin/reset-sales', need('admin'), async (req, res) => {
  ownerOnline(req);
  const b = parse(z.object({ secret: z.string().min(4).max(128), confirm: z.literal('KOSONGKAN') }), req.body);
  const user = req.auth.user!;
  const key = `reset|${user.id}`;
  await checkLock(key);
  const { rows } = await pool.query<{ pin_hash: string; password_hash: string | null }>('select pin_hash, password_hash from users where id = $1', [user.id]);
  const hash = rows[0]?.password_hash ?? rows[0]?.pin_hash;
  if (!hash || !(await verifyPin(b.secret, hash))) {
    await recordFail(key);
    throw new HttpError(401, rows[0]?.password_hash ? 'Kata sandi salah' : 'PIN salah');
  }
  await clearFails(key);
  const epoch: DataEpoch = { id: randomUUID(), at: new Date().toISOString() };
  const removed = await tx(async (c) => {
    const before = await counts(c);
    // Pergerakan stok dari penjualan/void uji ikut hilang: stok kembali seolah penjualan itu tidak terjadi.
    await c.query("delete from stock_movements where ref_type = 'order'");
    for (const t of SALES_TABLES) await c.query(`delete from ${t}`);
    await c.query(
      `insert into settings (key, value) values ('data_epoch', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(epoch)],
    );
    await audit(c, user.id, 'reset-sales', 'data', null, before);
    return before;
  });
  // Stok berubah karena konsumsi penjualan uji dihapus; samakan tingkat peringatan tanpa mengirim kabar.
  await stockChanged({ silent: true });
  res.json({ ok: true, removed, epoch });
});
