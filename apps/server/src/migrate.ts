import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { pool } from './db';

const dir = fileURLToPath(new URL('./migrations', import.meta.url));

/** Kunci advisory bersama: hanya satu instance yang menjalankan migrasi pada satu waktu. */
const MIGRATION_LOCK = 724_501;

/**
 * Menjalankan file SQL di folder migrations yang belum pernah dijalankan, berurutan.
 * Aman dijalankan bersamaan oleh beberapa instance (mis. fungsi serverless yang menyala bersamaan):
 * tiap migrasi memakai kunci per transaksi, jadi juga kompatibel dengan connection pooler.
 */
export async function migrate(db: pg.Pool = pool, log = console.log) {
  try {
    await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  } catch (e) {
    // Dua instance membuat tabel bersamaan: salah satu kalah balapan, tabel tetap sudah ada.
    if (!['23505', '42P07'].includes((e as { code?: string }).code ?? '')) throw e;
  }
  const { rows } = await db.query<{ name: string }>('select name from schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      const { rowCount } = await client.query('select 1 from schema_migrations where name = $1', [file]);
      if (rowCount) {
        // Instance lain sudah menerapkannya selagi kita menunggu kunci.
        await client.query('commit');
        continue;
      }
      await client.query(readFileSync(`${dir}/${file}`, 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      log(`Migrasi diterapkan: ${file}`);
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
