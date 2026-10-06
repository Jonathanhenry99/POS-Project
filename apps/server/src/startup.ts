// Persiapan database yang dipakai bersama oleh server biasa (index.ts) dan fungsi Vercel (vercel.ts).
import { config } from './config';
import { pool } from './db';
import { migrate } from './migrate';
import { seed, type InitialOwner } from './seed';

/** Melempar Error berpesan Indonesia bila database tidak siap; pemanggil yang memutuskan cara menampilkannya. */
export async function prepareDatabase(log: (s: string) => void = console.log) {
  try {
    await pool.query('select 1');
  } catch (e) {
    throw new Error(
      `Database tidak bisa dihubungi (${(e as Error).message || (e as { code?: string }).code || 'tanpa keterangan'}). ` +
        (config.isProd ? 'Periksa DATABASE_URL.' : 'Jalankan lewat "npm run dev" dari folder utama (database lokal ikut menyala otomatis).'),
    );
  }
  await migrate(pool, log);
  // Development: akun contoh + contoh menu. Production: hanya owner pertama dari environment, tanpa PIN bawaan.
  let initialOwner: InitialOwner | undefined;
  if (config.isProd) {
    const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from users');
    if (rows[0].n === 0) {
      const pin = process.env.INITIAL_OWNER_PIN ?? '';
      if (!pin) throw new Error('Database masih kosong. Isi INITIAL_OWNER_PIN (6 angka rahasia) di environment untuk membuat akun owner pertama.');
      initialOwner = {
        pin,
        name: process.env.INITIAL_OWNER_NAME?.trim() || 'Owner',
        username: (process.env.INITIAL_OWNER_USERNAME?.trim() || 'owner').toLowerCase(),
      };
    }
  }
  await seed(pool, { demo: !config.isProd, initialOwner, log });
}
