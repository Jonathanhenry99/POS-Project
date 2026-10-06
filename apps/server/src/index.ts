import { createApp } from './app';
import { config } from './config';
import { prepareDatabase } from './startup';

try {
  await prepareDatabase();
} catch (e) {
  console.error(`\n${(e as Error).message}`);
  process.exit(1);
}
createApp().listen(config.port, () => {
  console.log(`Mourden POS server berjalan di http://localhost:${config.port}`);
  if (!config.isProd) console.log('Buka aplikasi di http://localhost:5180');
});
