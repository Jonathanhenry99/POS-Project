// EKSPERIMENTAL: cetak lewat kabel USB OTG memakai WebUSB (cadangan bila Bluetooth bermasalah).
import { PrinterError, type PrintOutcome, type ReceiptPrinter } from './types';

const PRINTER_CLASS = 7;

export function webUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

/** Meminta izin memilih printer USB. Wajib dipanggil dari sentuhan tombol. */
export async function pickUsbPrinter(): Promise<void> {
  if (!navigator.usb) throw new PrinterError('unsupported', 'Browser ini tidak mendukung WebUSB.');
  // Tanpa filter kelas: banyak printer murah melapor sebagai kelas vendor (0xFF), bukan kelas printer.
  await navigator.usb.requestDevice({ filters: [] });
}

function findOutEndpoint(device: USBDeviceLike) {
  const interfaces = device.configuration?.interfaces ?? [];
  const candidates = [...interfaces].sort(
    (a, b) => Number(b.alternates[0]?.interfaceClass === PRINTER_CLASS) - Number(a.alternates[0]?.interfaceClass === PRINTER_CLASS),
  );
  for (const iface of candidates) {
    for (const alt of iface.alternates) {
      const ep = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
      if (ep) return { iface: iface.interfaceNumber, endpoint: ep.endpointNumber };
    }
  }
  return null;
}

export class WebUSBPrinter implements ReceiptPrinter {
  async isAvailable() {
    return webUsbSupported() && ((await navigator.usb!.getDevices()).length ?? 0) > 0;
  }

  async print(data: Uint8Array): Promise<PrintOutcome> {
    if (!webUsbSupported()) throw new PrinterError('unsupported', 'Browser ini tidak mendukung WebUSB.');
    const [device] = await navigator.usb!.getDevices();
    if (!device) throw new PrinterError('not-paired', 'Printer USB belum dipilih atau kabel terlepas.');
    try {
      if (!device.opened) await device.open();
      if (!device.configuration) await device.selectConfiguration(1);
      const target = findOutEndpoint(device);
      if (!target) throw new PrinterError('failed', 'Endpoint printer USB tidak ditemukan.');
      await device.claimInterface(target.iface);
      try {
        const res = await device.transferOut(target.endpoint, data as Uint8Array<ArrayBuffer>);
        if (res.status !== 'ok') throw new PrinterError('failed', `Printer menolak data (${res.status}).`);
      } finally {
        await device.releaseInterface(target.iface).catch(() => {});
      }
    } catch (e) {
      if (e instanceof PrinterError) throw e;
      throw new PrinterError('unavailable', `Printer USB tidak bisa diakses: ${(e as Error).message}`);
    }
    return { kind: 'confirmed', message: 'Struk terkirim ke printer USB.' };
  }
}
