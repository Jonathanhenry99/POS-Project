// Entry point fungsi Vercel: seluruh API Express berjalan sebagai satu fungsi di /api.
// Database disiapkan (migrasi + owner pertama) sekali per instance, saat permintaan pertama.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { prepareDatabase } from './startup';

const app = createApp();
let ready: Promise<void> | null = null;

/**
 * Rute Vercel meneruskan /api/<path> ke fungsi ini sebagai /api?__path=<path>.
 * Kembalikan URL aslinya agar router Express bekerja seperti di server biasa.
 * (Bila platform sudah meneruskan URL asli, parameter ini tidak ada dan URL dibiarkan.)
 */
export function restoreUrl(url: string): string {
  const u = new URL(url, 'http://local');
  const path = u.searchParams.get('__path');
  if (path === null) return url;
  u.searchParams.delete('__path');
  const rest = u.searchParams.toString();
  return `/api/${path.replace(/^\/+/, '')}${rest ? `?${rest}` : ''}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = restoreUrl(req.url ?? '/');
  try {
    ready ??= prepareDatabase(() => {});
    await ready;
  } catch (e) {
    ready = null; // coba lagi pada permintaan berikutnya
    console.error(e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: (e as Error).message }));
    return;
  }
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
