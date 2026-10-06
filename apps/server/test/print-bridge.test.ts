import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPrintBridge, sendTcp, type BridgeConfig } from '../src/print-bridge';

let config: BridgeConfig;
const origin = 'https://pos.example.test'; const token = 'test-only-bridge-token-123456789';
const body = () => ({ id: randomUUID(), printerId: 'bar', data: Buffer.from('CHECKER\n').toString('base64') });
const headers = { Origin: origin, Authorization: `Bearer ${token}` };
beforeEach(async () => { config = { token, origins: [origin], printers: { bar: { host: '192.168.1.50', port: 9100 } }, ledgerDir: await mkdtemp(join(tmpdir(), 'mourden-bridge-test-')) }; });
afterEach(async () => { await rm(config.ledgerDir, { recursive: true, force: true }); });

it('meneruskan byte sekali, dedupe tetap berlaku setelah service restart dan menolak ganti payload/target', async () => {
  const send = vi.fn(async () => {}); const b = body();
  const first = await request(createPrintBridge(config, send)).post('/print').set(headers).send(b);
  expect(first.status).toBe(200); expect(send.mock.calls).toHaveLength(1);
  const restarted = createPrintBridge(config, send);
  expect((await request(restarted).post('/print').set(headers).send(b)).body.duplicate).toBe(true);
  expect(send.mock.calls).toHaveLength(1);
  expect((await request(restarted).post('/print').set(headers).send({ ...b, data: Buffer.from('LAIN').toString('base64') })).status).toBe(409);
});

it('tidak meneruskan permintaan dari origin/token/ID printer yang tidak diizinkan', async () => {
  const send = vi.fn(async () => {}); const app = createPrintBridge(config, send);
  expect((await request(app).post('/print').set({ ...headers, Origin: 'https://other.test' }).send(body())).status).toBe(403);
  expect((await request(app).post('/print').set({ ...headers, Authorization: 'Bearer invalid' }).send(body())).status).toBe(401);
  expect((await request(app).post('/print').set(headers).send({ ...body(), printerId: '192.168.1.99' })).status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});

it('pengiriman tidak pasti tidak diulang tanpa konfirmasi, termasuk setelah restart', async () => {
  const b = body(); const send = vi.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(undefined);
  expect((await request(createPrintBridge(config, send)).post('/print').set(headers).send(b)).status).toBe(502);
  const app = createPrintBridge(config, send);
  expect((await request(app).post('/print').set(headers).send(b)).status).toBe(409);
  expect(send).toHaveBeenCalledTimes(1);
  expect((await request(app).post('/print').set(headers).send({ ...b, retryUncertain: true })).status).toBe(200);
  expect(send).toHaveBeenCalledTimes(2);
});

it('serialisasi per printer mencegah dua dokumen tercampur', async () => {
  let active = 0; let peak = 0;
  const send = async () => { active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 20)); active--; };
  const app = createPrintBridge(config, send);
  const responses = await Promise.all([request(app).post('/print').set(headers).send(body()), request(app).post('/print').set(headers).send(body())]);
  expect(responses.every((r) => r.status === 200)).toBe(true); expect(peak).toBe(1);
});

it('jalur TCP mengirim byte asli ke socket lokal tanpa perangkat printer', async () => {
  let received = Buffer.alloc(0); let resolveReceived!: () => void;
  const ended = new Promise<void>((resolve) => { resolveReceived = resolve; });
  const server = createServer((socket) => { socket.on('data', (b) => { received = Buffer.concat([received, b]); }); socket.on('end', resolveReceived); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await sendTcp('127.0.0.1', (server.address() as { port: number }).port, Buffer.from([0x1b, 0x40, 0x41, 0x0a])); await ended; expect([...received]).toEqual([0x1b, 0x40, 0x41, 0x0a]); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
