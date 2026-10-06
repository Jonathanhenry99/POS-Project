// Jalur utama: aplikasi RawBT di Android meneruskan byte ESC/POS ke printer Bluetooth/USB.
// Format intent sesuai konektor resmi RawBT (escpos-php RawbtPrintConnector):
//   intent:base64,<data>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
import { bytesToBase64 } from '@mourden/shared';
import { PrinterError, type PrintOutcome, type ReceiptPrinter } from './types';

export const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';

export function rawbtIntentUrl(data: Uint8Array): string {
  return `intent:base64,${bytesToBase64(data)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

export class RawBTPrinter implements ReceiptPrinter {
  constructor(private readonly navigate: (url: string) => void = (url) => window.location.assign(url)) {}

  async isAvailable() {
    // Web tidak bisa mendeteksi apakah RawBT terpasang; minimal harus di Android.
    return isAndroid();
  }

  async print(data: Uint8Array): Promise<PrintOutcome> {
    if (!(await this.isAvailable())) {
      throw new PrinterError('unavailable', 'RawBT hanya bisa dipakai di tablet/HP Android.');
    }
    // Harus dipanggil dari sentuhan tombol (Chrome memblokir intent tanpa interaksi pengguna).
    this.navigate(rawbtIntentUrl(data));
    return {
      kind: 'handed-off',
      message: 'Struk dikirim ke RawBT. Jika tidak keluar, buka RawBT untuk melihat status printer.',
    };
  }
}
