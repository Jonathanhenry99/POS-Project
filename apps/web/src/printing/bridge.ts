import { bytesToBase64 } from '@mourden/shared';
import { PrinterError, type PrinterConfig, type ReceiptPrinter, type PrintOutcome } from './types';

export class NetworkBridgePrinter implements ReceiptPrinter {
  constructor(private readonly config: PrinterConfig, private readonly jobId: string, private readonly retryUncertain = false) {}
  async isAvailable() { return !!(this.config.bridgeUrl && this.config.bridgeToken && this.config.bridgePrinterId); }
  async print(data: Uint8Array): Promise<PrintOutcome> {
    if (!await this.isAvailable()) throw new PrinterError('not-paired', 'Isi alamat bridge, token, dan ID printer di pengaturan profil.');
    const url = new URL(this.config.bridgeUrl!);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new PrinterError('failed', 'Alamat bridge harus URL HTTP/HTTPS tanpa kredensial atau parameter.');
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${url.href.replace(/\/$/, '')}/print`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.bridgeToken}` },
        body: JSON.stringify({ id: this.jobId, printerId: this.config.bridgePrinterId, data: bytesToBase64(data), retryUncertain: this.retryUncertain }), signal: ctrl.signal,
        targetAddressSpace: 'local',
      } as RequestInit);
      const body = await res.json() as { error?: string; state?: string };
      if (!res.ok) throw new PrinterError('failed', body.error ?? 'Bridge menolak job cetak.');
      if (body.state !== 'sent') throw new PrinterError('failed', 'Bridge belum memastikan pengiriman data. Periksa hasil fisik sebelum mencoba lagi.');
      return { kind: 'confirmed', message: 'Data diteruskan bridge ke jalur TCP printer. Periksa hasil cetak fisik.' };
    } catch (e) {
      if (e instanceof PrinterError) throw e;
      throw new PrinterError('failed', 'Bridge tidak merespons. Periksa jaringan/izin LAN browser dan hasil fisik sebelum mencoba ulang.');
    } finally { clearTimeout(timer); }
  }
}
