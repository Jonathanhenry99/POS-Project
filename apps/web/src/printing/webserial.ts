// EKSPERIMENTAL: cetak langsung ke printer Bluetooth klasik (SPP/RFCOMM) lewat Web Serial.
// Didukung Chrome Android 137+ untuk perangkat yang sudah di-pair di pengaturan Bluetooth Android.
import { PrinterError, type PrintOutcome, type ReceiptPrinter } from './types';

/** UUID standar Serial Port Profile (Bluetooth klasik). */
export const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
const CHUNK = 256;

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

/** Meminta izin memilih printer. Wajib dipanggil dari sentuhan tombol. */
export async function pickSerialPrinter(): Promise<void> {
  if (!navigator.serial) throw new PrinterError('unsupported', 'Browser ini tidak mendukung Web Serial.');
  await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID], filters: [{ bluetoothServiceClassId: SPP_UUID }] });
}

async function grantedPort(): Promise<SerialPortLike | null> {
  const ports = (await navigator.serial?.getPorts()) ?? [];
  return ports.find((p) => p.getInfo().bluetoothServiceClassId) ?? ports[0] ?? null;
}

export class WebSerialPrinter implements ReceiptPrinter {
  async isAvailable() {
    return webSerialSupported() && (await grantedPort()) !== null;
  }

  async print(data: Uint8Array): Promise<PrintOutcome> {
    if (!webSerialSupported()) throw new PrinterError('unsupported', 'Browser ini tidak mendukung Web Serial. Pakai Chrome terbaru.');
    const port = await grantedPort();
    if (!port) throw new PrinterError('not-paired', 'Printer belum dipilih. Buka halaman Printer lalu tekan "Pilih Printer".');
    try {
      // Baud rate diabaikan untuk Bluetooth RFCOMM, tetapi wajib diisi.
      await port.open({ baudRate: 9600 });
    } catch (e) {
      throw new PrinterError('unavailable', `Printer tidak tersambung. Pastikan printer menyala. (${(e as Error).message})`);
    }
    try {
      const writer = port.writable!.getWriter();
      try {
        for (let i = 0; i < data.length; i += CHUNK) await writer.write(data.slice(i, i + CHUNK));
      } finally {
        writer.releaseLock();
      }
    } catch (e) {
      throw new PrinterError('failed', `Gagal mengirim ke printer: ${(e as Error).message}`);
    } finally {
      await port.close().catch(() => {});
    }
    return { kind: 'confirmed', message: 'Struk terkirim ke printer.' };
  }
}
