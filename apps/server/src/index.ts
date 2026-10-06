import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { migrate } from './migrate';
import { seed, type InitialOwner } from './seed';

try {
  await pool.query('select 1');
} catch (e) {
  console.error(`\nDatabase tidak bisa dihubungi (${(e as Error).message}).`);
  console.error(config.isProd ? 'Periksa DATABASE_URL.' : 'Jalankan lewat "npm run dev" dari folder utama (database lokal ikut menyala otomatis).');
  process.exit(1);
}
await migrate();
// Development: akun contoh + contoh menu. Production: hanya owner pertama dari environment, tanpa PIN bawaan.
let initialOwner: InitialOwner | undefined;
if (config.isProd) {
  const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from users');
  if (rows[0].n === 0) {
    const pin = process.env.INITIAL_OWNER_PIN ?? '';
    if (!pin) {
      console.error('\nDatabase masih kosong. Isi INITIAL_OWNER_PIN (6 angka rahasia) di environment untuk membuat akun owner pertama.');
      process.exit(1);
    }
    initialOwner = {
      pin,
      name: process.env.INITIAL_OWNER_NAME?.trim() || 'Owner',
      username: (process.env.INITIAL_OWNER_USERNAME?.trim() || 'owner').toLowerCase(),
    };
  }
}
try {
  await seed(pool, { demo: !config.isProd, initialOwner });
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
}
createApp().listen(config.port, () => {
  console.log(`Mourden POS server berjalan di http://localhost:${config.port}`);
  if (!config.isProd) console.log('Buka aplikasi di http://localhost:5180');
});
