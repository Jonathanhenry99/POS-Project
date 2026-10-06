import pg from 'pg';
import { config } from './config';

// NUMERIC dikembalikan pg sebagai string; ubah ke number (jumlah stok/biaya kita jauh di bawah batas presisi).
pg.types.setTypeParser(1700, (v) => parseFloat(v));
// DATE dibiarkan string "YYYY-MM-DD" agar tidak bergeser zona waktu.
pg.types.setTypeParser(1082, (v) => v);
// BIGINT (hasil count/sum) ke number.
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export type Db = pg.Pool | pg.PoolClient;

export let pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

/** Dipakai tes untuk mengarahkan ke database lain. */
export function setPool(p: pg.Pool) {
  pool = p;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function audit(db: Db, userId: string | null, action: string, entity: string, entityId: string | null, data?: unknown) {
  await db.query('insert into audit_log (user_id, action, entity, entity_id, data) values ($1, $2, $3, $4, $5)', [
    userId,
    action,
    entity,
    entityId,
    data === undefined ? null : JSON.stringify(data),
  ]);
}
