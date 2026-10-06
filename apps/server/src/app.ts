import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { authenticate } from './auth';
import { config } from './config';
import { errorHandler } from './http';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { inventoryRouter } from './routes/inventory';
import { ordersRouter } from './routes/orders';
import { reportsRouter } from './routes/reports';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // CSP dimatikan karena web app disajikan dari sini dan butuh service worker + inline style React.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });
  api.use(authenticate);
  api.use(authRouter, adminRouter, catalogRouter, ordersRouter, inventoryRouter, reportsRouter);
  api.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint tidak ditemukan' });
  });
  app.use('/api', api);

  // Production: sajikan hasil build web (PWA) dari server yang sama.
  if (existsSync(config.webDist)) {
    app.use(
      express.static(config.webDist, {
        setHeaders(res, path) {
          // Service worker dan index.html jangan di-cache agar update aplikasi cepat sampai ke tablet.
          if (path.endsWith('sw.js') || path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(config.webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
