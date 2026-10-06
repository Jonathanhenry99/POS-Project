import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { pool } from './db';

const dir = fileURLToPath(new URL('./migrations', import.meta.url));

/** Menjalankan file SQL di folder migrations yang belum pernah dijalankan, berurutan. */
export async function migrate(db: pg.Pool = pool, log = console.log) {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const { rows } = await db.query<{ name: string }>('select name from schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query('begin');
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
