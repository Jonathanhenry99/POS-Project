// PostgreSQL lokal untuk development tanpa perlu instal Postgres/Docker.
// Data disimpan di apps/server/.pgdata. Hentikan dengan Ctrl+C.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const dir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const port = 54329;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => {} });

const fresh = !existsSync(dir);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('mourden');
console.log(`PostgreSQL development berjalan di port ${port} (database: mourden).`);
console.log('Biarkan terminal ini terbuka. Tekan Ctrl+C untuk berhenti.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
