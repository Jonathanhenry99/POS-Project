import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { verifyPin } from '@mourden/shared';
import { migrate } from '../src/migrate';
import { isStrongOwnerPin, seed } from '../src/seed';

// Database terpisah yang benar-benar kosong, meniru deploy production pertama.
const name = `seed_${randomUUID().replaceAll('-', '')}`;
let admin: pg.Pool;
let db: pg.Pool;

beforeAll(async () => {
  admin = new pg.Pool({ connectionString: inject('databaseUrl') });
  await admin.query(`create database "${name}"`);
  const url = new URL(inject('databaseUrl'));
  url.pathname = `/${name}`;
  db = new pg.Pool({ connectionString: url.toString() });
  await migrate(db, () => {});
});

afterAll(async () => {
  await db.end();
  await admin.query(`drop database "${name}" with (force)`);
  await admin.end();
});

describe('seed production', () => {
  it('menolak PIN owner yang lemah', () => {
    for (const weak of ['123456', '654321', '111111', '000000', '234567', '1234', '12345a']) expect(isStrongOwnerPin(weak)).toBe(false);
    expect(isStrongOwnerPin('482913')).toBe(true);
  });

  it('PIN lemah membatalkan pembuatan owner', async () => {
    await expect(seed(db, { demo: false, log: () => {}, initialOwner: { name: 'Owner', username: 'owner', pin: '123456' } })).rejects.toThrow('INITIAL_OWNER_PIN');
    const { rows } = await db.query('select count(*)::int as n from users');
    expect(rows[0].n).toBe(0);
  });

  it('hanya membuat satu owner dari environment, tanpa akun berPIN bawaan dan tanpa contoh menu', async () => {
    await seed(db, { demo: false, log: () => {}, initialOwner: { name: 'Jonathan', username: 'jonathan', pin: '482913' } });
    const { rows } = await db.query('select username, role, pin_hash from users');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: 'jonathan', role: 'owner' });
    expect(await verifyPin('482913', rows[0].pin_hash)).toBe(true);
    expect(await verifyPin('123456', rows[0].pin_hash)).toBe(false);
    const products = await db.query('select count(*)::int as n from products');
    expect(products.rows[0].n).toBe(0);
  });

  it('dijalankan ulang tidak mengubah apa pun', async () => {
    await seed(db, { demo: false, log: () => {}, initialOwner: { name: 'Lain', username: 'lain', pin: '739152' } });
    const { rows } = await db.query('select username from users');
    expect(rows.map((r) => r.username)).toEqual(['jonathan']);
  });
});
