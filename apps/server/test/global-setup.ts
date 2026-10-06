// Menjalankan PostgreSQL sementara untuk tes integrasi.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), 'mourden-test-pg-'));
  const port = 55000 + Math.floor(Math.random() * 1000);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('mourden_test');
  project.provide('databaseUrl', `postgres://postgres:postgres@localhost:${port}/mourden_test`);
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
