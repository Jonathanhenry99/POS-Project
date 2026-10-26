// Membuat output Vercel (Build Output API v3) setelah `npm run build`:
//   .vercel/output/static            -> web PWA (CDN)
//   .vercel/output/functions/api.func -> seluruh API Express sebagai satu fungsi di /api (region Singapura)
// Docs: https://vercel.com/docs/build-output-api
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}.vercel/output`;
const fn = `${out}/functions/api.func`;
const webDist = `${root}apps/web/dist`;

if (!existsSync(`${webDist}/index.html`)) {
  console.error('apps/web/dist belum ada. Jalankan `npm run build` dulu.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

// 1) Web statis
cpSync(webDist, `${out}/static`, { recursive: true });

// 2) Fungsi API: bundel satu file ESM + folder migrasi SQL (dibaca saat runtime)
await build({
  entryPoints: [`${root}apps/server/src/vercel.ts`],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // pg memuat modul opsional ini hanya bila tersedia.
  external: ['pg-native', 'pg-cloudflare', 'cloudflare:sockets'],
  // Beberapa dependensi masih CommonJS (memakai require); sediakan require di dalam bundel ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
cpSync(`${root}apps/server/src/migrations`, `${fn}/migrations`, { recursive: true });

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      // Express membaca body sendiri; helper Vercel dimatikan agar tidak bentrok.
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      maxDuration: 30,
      // Dekat dengan Indonesia & database Neon Singapura.
      regions: ['sin1'],
      environment: { NODE_ENV: 'production' },
    },
    null,
    2,
  ),
);

// 3) Routing
const noCache = { 'Cache-Control': 'no-cache' };
// Header keamanan halaman web (API sudah memakai helmet di Express). Harus sama dengan CONTENT_SECURITY_POLICY di
// apps/server/src/config.ts; tes server memeriksa keduanya tetap sama.
const CONTENT_SECURITY_POLICY = [
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
const security = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(self), serial=(self), bluetooth=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(?!api(?:/|$)).*$', headers: security, continue: true },
        // Service worker & index harus selalu dicek ulang agar update aplikasi cepat sampai ke tablet.
        { src: '^/(sw\\.js|index\\.html|manifest\\.webmanifest|registerSW\\.js)$', headers: noCache, continue: true },
        { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        // Semua /api/* ke satu fungsi; path asli dibawa lewat __path (lihat apps/server/src/vercel.ts).
        { src: '^/api/(.*)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
        // Aplikasi satu halaman: rute seperti /kasir atau /admin dilayani index.html.
        { src: '^/(?!api(?:/|$)).*$', dest: '/index.html', headers: noCache },
      ],
    },
    null,
    2,
  ),
);

console.log('Output Vercel siap di .vercel/output');
