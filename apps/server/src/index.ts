import { createApp } from './app';
import { config } from './config';
import { pool } from './db';
import { migrate } from './migrate';
import { seed } from './seed';

await migrate();
// Deploy pertama: buat akun default & pengaturan bila database masih kosong (tanpa contoh menu).
await seed(pool, { demo: false });
createApp().listen(config.port, () => {
  console.log(`Mourden POS server berjalan di http://localhost:${config.port}`);
  if (!config.isProd) console.log('Mode development. Web: http://localhost:5180');
});
