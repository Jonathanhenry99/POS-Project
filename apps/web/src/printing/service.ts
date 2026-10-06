// Penghubung antara aplikasi dan driver printer. Pilihan driver diambil dari pengaturan perangkat.
import {
  saleReceipt,
  shiftReceipt,
  testReceipt,
  toEscPos,
  toPlainText,
  type Order,
  type ReceiptOp,
  type Shift,
  type StoreSettings,
} from '@mourden/shared';
import { appStore } from '../lib/state';
import { createStore, useStore } from '../lib/store';
import { BrowserPrintFallback } from './browser';
import { RawBTPrinter } from './rawbt';
import { DEFAULT_PRINTER_CONFIG, PrinterError, type DriverId, type DriverInfo, type PrinterConfig, type ReceiptPrinter } from './types';
import { WebSerialPrinter } from './webserial';
import { WebUSBPrinter } from './webusb';

export const DRIVERS: DriverInfo[] = [
  {
    id: 'rawbt',
    label: 'RawBT (Bluetooth)',
    description: 'Jalur utama. Aplikasi RawBT di tablet meneruskan struk ke printer. Satu sentuhan, tanpa dialog.',
    experimental: false,
    needsPairing: false,
  },
  {
    id: 'webserial',
    label: 'Bluetooth langsung',
    description: 'Tanpa aplikasi tambahan, lewat Web Serial (Chrome Android 137+). Belum teruji di printer cafe.',
    experimental: true,
    needsPairing: true,
  },
  {
    id: 'webusb',
    label: 'Kabel USB OTG',
    description: 'Cadangan bila Bluetooth bermasalah. Printer dicolok ke tablet dengan kabel OTG.',
    experimental: true,
    needsPairing: true,
  },
  {
    id: 'browser',
    label: 'Cetak browser (darurat)',
    description: 'Memunculkan dialog cetak Android. Hanya untuk keadaan darurat.',
    experimental: false,
    needsPairing: false,
  },
];

const CONFIG_KEY = 'mourden.printer';

export function loadPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) } : DEFAULT_PRINTER_CONFIG;
  } catch {
    return DEFAULT_PRINTER_CONFIG;
  }
}

export const printerConfigStore = createStore<PrinterConfig>(loadPrinterConfig());

export function savePrinterConfig(patch: Partial<PrinterConfig>) {
  printerConfigStore.set(patch);
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(printerConfigStore.get()));
  } catch {
    /* tetap berlaku selama aplikasi terbuka */
  }
}

export const usePrinterConfig = () => useStore(printerConfigStore, (s) => s);

// ---------- Status cetak terakhir ----------

export type PrintStatus =
  | { state: 'idle' }
  | { state: 'printing'; label: string }
  | { state: 'done'; label: string; confirmed: boolean; message: string; at: number }
  | { state: 'error'; label: string; message: string; code: PrinterError['code']; retry: () => Promise<void> };

export const printStatusStore = createStore<{ status: PrintStatus }>({ status: { state: 'idle' } });
export const usePrintStatus = () => useStore(printStatusStore, (s) => s.status);

function driverFor(id: DriverId, textForBrowser: () => string): ReceiptPrinter {
  switch (id) {
    case 'rawbt':
      return new RawBTPrinter();
    case 'webserial':
      return new WebSerialPrinter();
    case 'webusb':
      return new WebUSBPrinter();
    case 'browser':
      return new BrowserPrintFallback(textForBrowser);
  }
}

function storeSettings(): StoreSettings {
  const data = appStore.get().data;
  if (!data) throw new PrinterError('failed', 'Data toko belum dimuat');
  return data.settings.store;
}

/** Mencetak satu dokumen. Tidak pernah melempar error: hasilnya ada di status. */
async function run(label: string, build: () => ReceiptOp[]): Promise<boolean> {
  const config = printerConfigStore.get();
  printStatusStore.set({ status: { state: 'printing', label } });
  try {
    const ops = build();
    const driver = driverFor(config.driver, () => toPlainText(ops, config.width));
    const outcome = await driver.print(toEscPos(ops));
    printStatusStore.set({ status: { state: 'done', label, confirmed: outcome.kind === 'confirmed', message: outcome.message, at: Date.now() } });
    return true;
  } catch (e) {
    const err = e instanceof PrinterError ? e : new PrinterError('failed', (e as Error)?.message ?? String(e));
    printStatusStore.set({
      status: {
        state: 'error',
        label,
        message: err.message,
        code: err.code,
        retry: async () => {
          await run(label, build);
        },
      },
    });
    return false;
  }
}

export async function printOrder(order: Order, opts: { reprint?: boolean } = {}) {
  const config = printerConfigStore.get();
  const store = storeSettings();
  const label = `${opts.reprint ? 'Cetak ulang' : 'Struk'} ${order.number}`;
  const copies = opts.reprint ? 1 : Math.max(1, Math.min(3, config.copies));
  // Semua salinan dikirim dalam satu kali kirim (RawBT hanya bisa dipanggil sekali per sentuhan).
  return run(label, () => {
    const ops: ReceiptOp[] = [];
    for (let i = 0; i < copies; i++) ops.push(...saleReceipt(order, store, config, { reprint: opts.reprint || i > 0 }));
    return ops;
  });
}

export function printTest() {
  const config = printerConfigStore.get();
  const info = DRIVERS.find((d) => d.id === config.driver)!;
  return run('Tes printer', () => testReceipt(storeSettings(), config, info.label, new Date().toISOString()));
}

export function printShift(shift: Shift) {
  const config = printerConfigStore.get();
  return run('Rekap tutup kasir', () => shiftReceipt(shift, storeSettings(), config));
}

/** Teks pratinjau struk untuk layar. */
export function previewOrder(order: Order): string {
  const config = printerConfigStore.get();
  return toPlainText(saleReceipt(order, storeSettings(), config), config.width);
}
