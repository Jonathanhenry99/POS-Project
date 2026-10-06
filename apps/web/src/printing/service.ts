// Penghubung antara aplikasi dan driver printer. Pilihan driver diambil dari pengaturan perangkat.
import {
  saleReceipt,
  businessDayReceipt,
  can,
  DEFAULT_RECEIPT_SETTINGS,
  shiftReceipt,
  testReceipt,
  toEscPos,
  toPlainText,
  type Order,
  type BusinessDay,
  type ReceiptOp,
  type ReceiptStyle,
  type Shift,
  type StoreSettings,
  type Station,
} from '@mourden/shared';
import { useEffect, useState } from 'react';
import { DEFAULT_LOGO, receiptLogoFor } from '../lib/brand';
import { appStore, useApp } from '../lib/state';
import { uuid } from '../lib/id';
import { db } from '../lib/idb';
import { enqueue } from '../lib/sync';
import { createStore, useStore } from '../lib/store';
import { BrowserPrintFallback } from './browser';
import { RawBTPrinter } from './rawbt';
import { DEFAULT_PRINTER_CONFIG, PrinterError, type DriverId, type DriverInfo, type PrinterConfig, type ReceiptPrinter } from './types';
import { WebSerialPrinter } from './webserial';
import { WebUSBPrinter } from './webusb';
import { NetworkBridgePrinter } from './bridge';
import { claimPrintJob, finishPrintJob, makePrintJob, storePrintJobs } from './queue';
import { confirmDialog, toast } from '../components/feedback';

export const DRIVERS: DriverInfo[] = [
  { id: 'bridge', label: 'Bridge jaringan (LAN)', description: 'Service lokal meneruskan data ke printer TCP. Perlu konfigurasi service, jaringan dan izin browser; hasil fisik belum diuji.', experimental: true, needsPairing: false },
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

function driverFor(id: DriverId, textForBrowser: () => string, config = printerConfigStore.get(), jobId = uuid(), retryUncertain = false): ReceiptPrinter {
  switch (id) {
    case 'rawbt':
      return new RawBTPrinter();
    case 'webserial':
      return new WebSerialPrinter();
    case 'webusb':
      return new WebUSBPrinter();
    case 'browser':
      return new BrowserPrintFallback(textForBrowser);
    case 'bridge':
      return new NetworkBridgePrinter(config, jobId, retryUncertain);
  }
}

function storeSettings(): StoreSettings {
  const data = appStore.get().data;
  if (!data) throw new PrinterError('failed', 'Data toko belum dimuat');
  return data.settings.store;
}

/** Bentuk struk + bitmap logo dari pengaturan toko. Logo yang gagal dimuat tidak menggagalkan cetak. */
export async function receiptStyle(widthChars = printerConfigStore.get().width): Promise<ReceiptStyle> {
  const settings = appStore.get().data?.settings;
  const format = settings?.receipt ?? DEFAULT_RECEIPT_SETTINGS;
  const logo = await receiptLogoFor(settings?.brand?.logo || DEFAULT_LOGO, format, widthChars);
  return { format, logo };
}

/** Bentuk struk untuk pratinjau; null selama logo masih disiapkan. */
export function useReceiptStyle(): ReceiptStyle | null {
  const settings = useApp((s) => s.data?.settings);
  const width = useStore(printerConfigStore, (s) => s.width);
  const [style, setStyle] = useState<ReceiptStyle | null>(null);
  useEffect(() => {
    let live = true;
    void receiptStyle(width).then((s) => live && setStyle(s));
    return () => {
      live = false;
    };
  }, [settings, width]);
  return style;
}

// Siapkan bitmap logo lebih awal (saat data toko dimuat/berubah) agar tombol cetak tidak menunggu.
let warmedSettings: unknown = null;
appStore.subscribe(() => {
  const settings = appStore.get().data?.settings;
  if (settings && settings !== warmedSettings) {
    warmedSettings = settings;
    void receiptStyle();
  }
});

/** Mencetak satu dokumen. Tidak pernah melempar error: hasilnya ada di status. */
async function runImmediate(label: string, build: () => ReceiptOp[]): Promise<boolean> {
  if (sending) { toast('Tunggu pengiriman cetak selesai', 'info'); return false; }
  sending = true;
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
          if (await confirmDialog({ title: 'Kirim perintah lagi?', message: 'Periksa printer/laci terlebih dahulu. Perintah sebelumnya mungkin sudah diterima.', confirmLabel: 'Kirim lagi' })) await runImmediate(label, build);
        },
      },
    });
    return false;
  } finally { sending = false; }
}

let sending = false;
export async function sendPrintJob(id: string, acknowledgeDuplicate = false): Promise<boolean> {
  if (sending) { toast('Tunggu pengiriman cetak saat ini selesai', 'info'); return false; }
  sending = true;
  let job: Awaited<ReturnType<typeof claimPrintJob>> | null = null;
  try {
    job = await claimPrintJob(id, acknowledgeDuplicate);
    printStatusStore.set({ status: { state: 'printing', label: job.label } });
    const profile = printerProfilesStore.get().list.find((p) => p.id === job!.profileId);
    const config = { ...job.config, bridgeToken: profile?.config.bridgeToken };
    // Token boleh diperbarui, tetapi target yang sudah diantrekan tidak berubah diam-diam.
    const outcome = await driverFor(config.driver, () => toPlainText(job!.ops, config.width), config, job.id, acknowledgeDuplicate).print(toEscPos(job.ops));
    await finishPrintJob(job, 'handed-off', outcome.message);
    printStatusStore.set({ status: { state: 'done', label: job.label, confirmed: outcome.kind === 'confirmed', message: outcome.message, at: Date.now() } });
    return true;
  } catch (e) {
    const err = e instanceof PrinterError ? e : new PrinterError('failed', (e as Error)?.message ?? String(e));
    if (job) {
      const beforeSend = err.code === 'not-paired' || err.code === 'unsupported' || (job.config.driver === 'rawbt' && err.code === 'unavailable');
      await finishPrintJob(job, beforeSend ? 'failed' : 'uncertain', err.message).catch(() => {});
    }
    printStatusStore.set({ status: { state: 'error', label: job?.label ?? 'Antrean cetak', message: err.message, code: err.code, retry: async () => {
      if (await confirmDialog({ title: 'Coba cetak lagi?', message: 'Periksa hasil fisik terlebih dahulu. Pengiriman sebelumnya mungkin sudah diterima; mencetak ulang bisa menghasilkan salinan ganda.', confirmLabel: 'Coba lagi' })) await sendPrintJob(id, true);
    } } });
    return false;
  } finally { sending = false; }
}

async function run(label: string, build: () => ReceiptOp[]): Promise<boolean> {
  try {
    const state = printerProfilesStore.get();
    const profile = state.list.find((p) => p.id === state.activeId)!;
    const job = makePrintJob(label, build(), { ...profile, config: printerConfigStore.get() });
    await storePrintJobs([job]);
    return sendPrintJob(job.id);
  } catch (e) {
    printStatusStore.set({ status: { state: 'error', label, message: `Job belum tersimpan: ${String((e as Error).message)}`, code: 'failed', retry: async () => { await run(label, build); } } });
    return false;
  }
}

export async function printOrder(order: Order, opts: { reprint?: boolean } = {}) {
  const config = printerConfigStore.get();
  const store = storeSettings();
  const label = `${opts.reprint ? 'Cetak ulang' : 'Struk'} ${order.number}`;
  const copies = opts.reprint ? 1 : Math.max(1, Math.min(3, config.copies));
  const style = await receiptStyle(config.width);
  // Semua salinan dikirim dalam satu kali kirim (RawBT hanya bisa dipanggil sekali per sentuhan).
  return run(label, () => {
    const ops: ReceiptOp[] = [];
    for (let i = 0; i < copies; i++) ops.push(...saleReceipt(order, store, config, { ...style, reprint: opts.reprint || i > 0 }));
    return ops;
  });
}

export async function printTest() {
  const config = printerConfigStore.get();
  const info = DRIVERS.find((d) => d.id === config.driver)!;
  const style = await receiptStyle(config.width);
  return run('Tes printer', () => testReceipt(storeSettings(), config, info.label, new Date().toISOString(), style));
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
  const success = await runImmediate('Buka laci uang', () => [{ kind: 'drawer' }]);
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
export async function printBill(draft: Order) {
  const config = printerConfigStore.get();
  const store = storeSettings();
  const style = await receiptStyle(config.width);
  return run('Tagihan', () => saleReceipt(draft, store, config, { ...style, bill: true }));
}

/** Pratinjau struk untuk layar (bentuk & logo sama dengan hasil cetak). */
export function previewOrderOps(order: Order, style: ReceiptStyle): ReceiptOp[] {
  return saleReceipt(order, storeSettings(), printerConfigStore.get(), style);
}
