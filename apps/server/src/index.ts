import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { migrate } from './migrate';
import { seed } from './seed';

try {
  await pool.query('select 1');
} catch (e) {
  console.error(`\nDatabase tidak bisa dihubungi (${(e as Error).message}).`);
  console.error(config.isProd ? 'Periksa DATABASE_URL.' : 'Jalankan lewat "npm run dev" dari folder utama (database lokal ikut menyala otomatis).');
  process.exit(1);
}
await migrate();
// Akun default & pengaturan dibuat bila database masih kosong. Di development, contoh menu juga diisi.
await seed(pool, { demo: !config.isProd });
createApp().listen(config.port, () => {
  console.log(`Mourden POS server berjalan di http://localhost:${config.port}`);
  if (!config.isProd) console.log('Buka aplikasi di http://localhost:5180');
});
