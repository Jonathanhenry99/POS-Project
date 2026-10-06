import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrintBridge, type BridgeConfig } from '../src/print-bridge';

// Jalankan service ini di PC/Raspberry Pi jaringan cafe. Jangan membuka port bridge ke internet.
const config: BridgeConfig = {
  token: process.env.PRINT_BRIDGE_TOKEN ?? '',
  origins: (process.env.PRINT_BRIDGE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  printers: JSON.parse(process.env.PRINT_BRIDGE_PRINTERS ?? '{}'),
  ledgerDir: resolve(process.env.PRINT_BRIDGE_LEDGER ?? '.print-bridge'),
};
if (!Object.keys(config.printers).length) throw new Error('Isi PRINT_BRIDGE_PRINTERS dengan ID printer, IP LAN dan port');
const app = createPrintBridge(config);
const port = Number(process.env.PRINT_BRIDGE_PORT ?? 9191);
const bind = process.env.PRINT_BRIDGE_BIND ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port bridge tidak valid');
const cert = process.env.PRINT_BRIDGE_TLS_CERT; const key = process.env.PRINT_BRIDGE_TLS_KEY;
if (!!cert !== !!key) throw new Error('Isi cert dan key TLS bersamaan');
const ready = () => console.log(`Print bridge aktif di ${bind}:${port}; target berasal dari konfigurasi service.`);
if (cert && key) createServer({ cert: readFileSync(cert), key: readFileSync(key) }, app).listen(port, bind, ready);
else app.listen(port, bind, ready);
