import { createApp } from './app';
import { config } from './config';
import { migrate } from './migrate';

await migrate();
createApp().listen(config.port, () => {
  console.log(`Mourden POS server berjalan di http://localhost:${config.port}`);
  if (!config.isProd) console.log('Mode development. Jalankan juga web: npm run dev -w @mourden/web');
});
