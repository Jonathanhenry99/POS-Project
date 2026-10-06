import type { ReceiptLayout } from '@mourden/shared';

/** Antarmuka printer yang terpisah dari logika bisnis. Semua jalur cetak mengikuti bentuk ini. */
export interface ReceiptPrinter {
  print(data: Uint8Array): Promise<PrintOutcome>;
  isAvailable(): Promise<boolean>;
}

export type DriverId = 'rawbt' | 'webserial' | 'webusb' | 'browser' | 'bridge';

export interface DriverInfo {
  id: DriverId;
  label: string;
  description: string;
  /** Eksperimental: belum teruji di perangkat cafe. */
  experimental: boolean;
  /** Butuh memilih/izin perangkat lebih dulu di halaman Printer. */
  needsPairing: boolean;
}

/**
 * confirmed = printer menerima data (USB/Serial).
 * handed-off = data diserahkan ke aplikasi lain (RawBT); hasil cetak tidak bisa dipastikan dari web.
 */
export interface PrintOutcome {
  kind: 'confirmed' | 'handed-off';
  message: string;
}

export class PrinterError extends Error {
  constructor(
    readonly code: 'unavailable' | 'not-paired' | 'failed' | 'unsupported',
    message: string,
  ) {
    super(message);
  }
}

export interface PrinterConfig extends ReceiptLayout {
  driver: DriverId;
  /** Cetak struk otomatis setelah pembayaran. */
  autoPrint: boolean;
  /** Jumlah salinan struk penjualan. */
  copies: number;
  bridgeUrl?: string;
  bridgeToken?: string;
  bridgePrinterId?: string;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  driver: 'rawbt',
  width: 32,
  feedLines: 4,
  cut: false,
  openDrawer: false,
  autoPrint: true,
  copies: 1,
};
