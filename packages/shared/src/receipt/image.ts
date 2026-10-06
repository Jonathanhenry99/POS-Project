// Logo bitmap hitam-putih untuk struk. Murni: piksel RGBA masuk, bit raster keluar.
// Pengubahan ukuran gambar dilakukan di sisi web (canvas); modul ini hanya memangkas & mengonversi.
import type { LogoDarkness, LogoSize } from '../types';

/** Bitmap 1-bit: setiap baris ceil(width/8) byte, bit paling kiri = MSB, 1 = titik hitam. Data dalam base64. */
export interface ReceiptImage {
  width: number;
  height: number;
  data: string;
}

/** Titik cetak per baris: printer 58 mm (32 karakter) = 384 titik, 80 mm (48 karakter) = 576 titik. */
export function paperDots(widthChars: number): number {
  return widthChars >= 48 ? 576 : 384;
}

const SIZE_FRACTION: Record<LogoSize, number> = { small: 0.4, medium: 0.55, large: 0.75 };

/** Lebar logo dalam titik (kelipatan 8) dan batas tingginya supaya logo tinggi tidak memboroskan kertas. */
export function logoBox(size: LogoSize, widthChars: number): { width: number; maxHeight: number } {
  const dots = paperDots(widthChars);
  const width = Math.max(64, Math.floor((dots * SIZE_FRACTION[size]) / 8) * 8);
  return { width, maxHeight: Math.round(width * 0.75) };
}

/** Ambang terang (0-255) di bawahnya piksel dianggap tinta. */
export const DARKNESS_THRESHOLD: Record<LogoDarkness, number> = { light: 100, normal: 150, dark: 200 };

/** Kecerahan piksel setelah ditumpuk di atas kertas putih (transparan = putih). */
function lumaOnWhite(rgba: ArrayLike<number>, i: number): number {
  const a = rgba[i + 3] / 255;
  const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return l * a + 255 * (1 - a);
}

/** Kotak terkecil yang memuat piksel bertinta (untuk membuang margin putih/transparan). null bila gambar kosong. */
export function contentBounds(rgba: ArrayLike<number>, width: number, height: number, threshold = 235) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (lumaOnWhite(rgba, (y * width + x) * 4) < threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Mengubah piksel RGBA (ukuran sudah final) menjadi bitmap 1-bit dengan ambang tetap. Logo berwarna rata paling tajam tanpa dithering. */
export function rasterize(rgba: ArrayLike<number>, width: number, height: number, threshold: number): ReceiptImage {
  const rowBytes = Math.ceil(width / 8);
  const bytes = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (lumaOnWhite(rgba, (y * width + x) * 4) < threshold) bytes[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data: bytesToB64(bytes) };
}

export function imageBytes(img: ReceiptImage): Uint8Array {
  const bin = atob(img.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Tinggi per potongan GS v 0. Potongan kecil aman untuk buffer printer murah. */
export const RASTER_BAND = 96;

/**
 * GS v 0 m xL xH yL yH d1..dk (raster bit image), dipotong per RASTER_BAND baris.
 * Perintah ini didukung luas oleh printer thermal ESC/POS 58 mm, termasuk seri RPP02.
 */
export function rasterCommands(img: ReceiptImage): number[] {
  const rowBytes = Math.ceil(img.width / 8);
  const bytes = imageBytes(img);
  const out: number[] = [];
  for (let y = 0; y < img.height; y += RASTER_BAND) {
    const rows = Math.min(RASTER_BAND, img.height - y);
    out.push(0x1d, 0x76, 0x30, 0x00, rowBytes & 0xff, rowBytes >> 8, rows & 0xff, rows >> 8);
    for (let i = y * rowBytes; i < (y + rows) * rowBytes; i++) out.push(bytes[i]);
  }
  return out;
}
