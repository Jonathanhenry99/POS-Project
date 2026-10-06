// Penghubung antara aplikasi dan driver printer. Pilihan driver diambil dari pengaturan perangkat.
import {
  saleReceipt,
  businessDayReceipt,
  can,
  shiftReceipt,
  testReceipt,
  toEscPos,
  toPlainText,
  type Order,
  type BusinessDay,
  type ReceiptOp,
  type Shift,
  type StoreSettings,
} from '@mourden/shared';
import { appStore } from '../lib/state';
import { uuid } from '../lib/id';
import { db } from '../lib/idb';
import { enqueue } from '../lib/sync';
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

const PROFILES_KEY = 'mourden.printer-profiles';
export interface PrinterProfile { id: string; name: string; config: PrinterConfig }
function loadProfiles(): { activeId: string; list: PrinterProfile[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? 'null');
    if (saved && typeof saved.activeId === 'string' && Array.isArray(saved.list) && saved.list.length && saved.list.every((p: PrinterProfile) => typeof p.id === 'string' && typeof p.name === 'string' && p.config && DRIVERS.some((d) => d.id === p.config.driver))) return saved;
  } catch { /* profil lama tetap memakai konfigurasi existing */ }
  return { activeId: 'existing', list: [{ id: 'existing', name: 'Printer kasir', config: { ...printerConfigStore.get() } }] };
}
export const printerProfilesStore = createStore(loadProfiles());
export const usePrinterProfiles = () => useStore(printerProfilesStore, (s) => s);
function persistProfiles() {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(printerProfilesStore.get())); } catch { /* berlaku selama sesi */ }
}
export function createPrinterProfile(name: string) {
  const label = name.trim().slice(0, 60);
  if (!label) throw new Error('Isi nama profil printer');
  if (printerProfilesStore.get().list.some((p) => p.name.toLowerCase() === label.toLowerCase())) throw new Error('Nama profil sudah digunakan');
  if (printerProfilesStore.get().list.length >= 12) throw new Error('Maksimal 12 profil pada perangkat ini');
  const profile = { id: uuid(), name: label, config: { ...printerConfigStore.get() } };
  printerProfilesStore.set((s) => ({ activeId: profile.id, list: [...s.list, profile] }));
  persistProfiles(); return profile;
}
export function selectPrinterProfile(id: string) {
  const profile = printerProfilesStore.get().list.find((p) => p.id === id);
  if (!profile) throw new Error('Profil tidak ditemukan');
  printerProfilesStore.set({ activeId: id });
  savePrinterConfig(profile.config);
}

export function savePrinterConfig(patch: Partial<PrinterConfig>) {
  printerConfigStore.set(patch);
  printerProfilesStore.set((s) => ({ ...s, list: s.list.map((p) => p.id === s.activeId ? { ...p, config: { ...printerConfigStore.get() } } : p) }));
  persistProfiles();
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

export function printBusinessDay(day: BusinessDay) {
  const config = printerConfigStore.get();
  return run('Rekap tutup hari', () => businessDayReceipt(day, storeSettings(), config));
}

/** Pulsa ESC/POS tanpa transaksi/struk. Tersedia hanya jika drawer diaktifkan dan jalur mendukung byte raw. */
export async function openCashDrawer() {
  const user = appStore.get().user;
  if (!user || !can(user.role, 'pos.shift')) throw new Error('Tidak punya izin membuka laci');
  const config = printerConfigStore.get();
  if (!config.openDrawer) throw new Error('Aktifkan pengaturan laci dan pastikan laci tersambung ke printer');
  if (config.driver === 'browser') throw new Error('Cetak browser tidak dapat mengirim perintah laci');
  const success = await run('Buka laci uang', () => [{ kind: 'drawer' }]);
  const entry = { id: uuid(), at: new Date().toISOString(), userName: user.name, profileName: printerProfilesStore.get().list.find((p) => p.id === printerProfilesStore.get().activeId)?.name ?? '', driver: config.driver, outcome: success ? 'sent' : 'failed' };
  const d = await db();
  const tx = d.transaction('kv', 'readwrite');
  const previous = await tx.store.get('printer.actions') as typeof entry[] | undefined;
  await tx.store.put([entry, ...(previous ?? [])].slice(0, 100), 'printer.actions');
  await tx.done;
  await enqueue({ method: 'POST', path: `/tablet/printer-actions/${entry.id}`, body: entry, operatorId: user.id, label: 'Log buka laci uang', ref: null });
  return success;
}

/** Cetak tagihan sementara (sebelum bayar) dari isi keranjang. */
export function printBill(draft: Order) {
  const config = printerConfigStore.get();
  const store = storeSettings();
  return run('Tagihan', () => saleReceipt(draft, store, config, { bill: true }));
}

/** Teks pratinjau struk untuk layar. */
export function previewOrder(order: Order): string {
  const config = printerConfigStore.get();
  return toPlainText(saleReceipt(order, storeSettings(), config), config.width);
}
