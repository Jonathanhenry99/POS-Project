import { fileURLToPath } from 'node:url';

// Di Vercel selalu dianggap production, agar tidak pernah jatuh ke default development (PIN bawaan).
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

function required(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Environment variable ${name} wajib diisi di production`);
  return devDefault;
}

/**
 * Kebijakan keamanan konten untuk halaman web: skrip hanya dari situs ini (tidak ada skrip sisipan/pihak ketiga),
 * tidak boleh dibingkai situs lain. Gaya inline diizinkan karena React memakai atribut style. Koneksi ke
 * https/localhost tetap boleh untuk bridge printer LAN eksperimen. Dipakai Express dan konfigurasi Vercel.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export const config = {
  isProd,
  port: parseInt(process.env.PORT ?? '8787', 10),
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:54329/mourden'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-ganti-di-production'),
  /** Batas aman panjang rahasia sesi di production. */
  minJwtSecretLength: 32,
  /** Jumlah koneksi database per instance. Serverless (Vercel) memakai sedikit koneksi agar tidak habis. */
  poolMax: parseInt(process.env.PG_POOL_MAX ?? (process.env.VERCEL ? '3' : '10'), 10),
  /** Origin web yang diizinkan (dipisah koma). Kosong = hanya same-origin. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Alamat layanan pengirim WhatsApp (bawaan: CallMeBot). Bisa diganti tanpa mengubah kode. */
  whatsappApiUrl: process.env.WHATSAPP_API_URL ?? 'https://api.callmebot.com/whatsapp.php',
  /** Folder hasil build web untuk disajikan oleh server yang sama (production). */
  webDist: process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
};

if (config.isProd && config.jwtSecret.length < config.minJwtSecretLength) {
  throw new Error(`JWT_SECRET terlalu pendek (minimal ${config.minJwtSecretLength} karakter acak). Contoh: openssl rand -hex 32`);
}
