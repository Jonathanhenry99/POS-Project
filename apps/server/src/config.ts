import { fileURLToPath } from 'node:url';

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Environment variable ${name} wajib diisi di production`);
  return devDefault;
}

export const config = {
  isProd,
  port: parseInt(process.env.PORT ?? '8787', 10),
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:54329/mourden'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-ganti-di-production'),
  /** Origin web yang diizinkan (dipisah koma). Kosong = hanya same-origin. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Folder hasil build web untuk disajikan oleh server yang sama (production). */
  webDist: process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
};
