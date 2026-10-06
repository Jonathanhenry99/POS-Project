// Service LAN mandiri, tidak memakai database/transaksi POS atau menerima alamat TCP dari browser.
import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createConnection, isIP } from 'node:net';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

export interface BridgeConfig { token: string; origins: string[]; printers: Record<string, { host: string; port: number }>; ledgerDir: string }
type Entry = { hash: string; state: 'sending' | 'sent' | 'uncertain'; at: string };
export function sendTcp(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((done, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Printer TCP tidak merespons')); }, 8_000);
    socket.once('error', (e) => { clearTimeout(timer); reject(e); });
    socket.once('connect', () => socket.end(data));
    // finish = semua byte diserahkan ke socket. Bukan acknowledgement cetak fisik.
    socket.once('finish', () => { clearTimeout(timer); done(); socket.destroy(); });
  });
}

export function privatePrinterHost(host: string) {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function createPrintBridge(config: BridgeConfig, send = sendTcp) {
  if (config.token.length < 24 || !config.origins.length) throw new Error('Token bridge minimal 24 karakter dan origin POS wajib diisi');
  for (const p of Object.values(config.printers)) if (!privatePrinterHost(p.host) || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535) throw new Error('Printer harus IP LAN/loopback dan port valid');
  const app = express(); app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (!origin || !config.origins.includes(origin)) { res.status(403).json({ error: 'Origin POS tidak diizinkan' }); return; }
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    const supplied = Buffer.from(req.get('Authorization') ?? ''); const expected = Buffer.from(`Bearer ${config.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.status(401).json({ error: 'Token bridge tidak valid' }); return; }
    next();
  });
  app.use(express.json({ limit: '400kb' }));
  const schema = z.object({ id: z.uuid(), printerId: z.string().min(1).max(60), data: z.string().min(4).max(350_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), retryUncertain: z.boolean().default(false) });
  const active = new Set<string>(); const tails = new Map<string, Promise<void>>();
  app.post('/print', async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Job cetak tidak valid' }); return; }
    const job = parsed.data; const printer = Object.hasOwn(config.printers, job.printerId) ? config.printers[job.printerId] : null;
    if (!printer) { res.status(400).json({ error: 'ID printer tidak terdaftar pada bridge' }); return; }
    const bytes = Buffer.from(job.data, 'base64');
    if (!bytes.length || bytes.length > 256_000) { res.status(400).json({ error: 'Dokumen terlalu besar' }); return; }
    if (active.has(job.id)) { res.status(409).json({ error: 'Job sedang dikirim' }); return; }
    active.add(job.id);
    const path = resolve(config.ledgerDir, `${job.id}.json`);
    const save = async (entry: Entry) => { await writeFile(`${path}.tmp`, JSON.stringify(entry), { mode: 0o600 }); await rename(`${path}.tmp`, path); };
    const hash = createHash('sha256').update(job.printerId).update(bytes).digest('hex');
    try {
      await mkdir(config.ledgerDir, { recursive: true, mode: 0o700 });
      let previous: Entry | null = null;
      try { previous = JSON.parse(await readFile(path, 'utf8')) as Entry; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      if (previous && previous.hash !== hash) { res.status(409).json({ error: 'ID job sudah dipakai untuk dokumen/target lain' }); return; }
      if (previous?.state === 'sent') { res.json({ state: 'sent', duplicate: true }); return; }
      if (previous && !job.retryUncertain) { res.status(409).json({ error: 'Hasil sebelumnya tidak pasti. Periksa kertas lalu konfirmasi percobaan ulang.' }); return; }
      await save({ hash, state: 'sending', at: new Date().toISOString() });
      // Satu printer menerima satu dokumen setiap saat, termasuk permintaan dari beberapa tablet.
      const tail = (tails.get(job.printerId) ?? Promise.resolve()).catch(() => {}).then(() => send(printer.host, printer.port, bytes));
      tails.set(job.printerId, tail);
      try {
        await tail; await save({ hash, state: 'sent', at: new Date().toISOString() });
        res.json({ state: 'sent', duplicate: false });
      } catch {
        await save({ hash, state: 'uncertain', at: new Date().toISOString() });
        res.status(502).json({ error: 'Pengiriman TCP gagal/tidak pasti. Periksa printer sebelum mencoba ulang.' });
      } finally { if (tails.get(job.printerId) === tail) tails.delete(job.printerId); }
    } catch { res.status(500).json({ error: 'Ledger bridge tidak tersedia; periksa penyimpanan service dan hasil cetak.' }); }
    finally { active.delete(job.id); }
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Endpoint bridge tidak ditemukan' }); });
  app.use(((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ error: 'Payload bridge tidak valid/terlalu besar' }); }) as express.ErrorRequestHandler);
  return app;
}
