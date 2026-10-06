// Representasi struk yang netral printer, lalu dirender ke byte ESC/POS atau teks polos.
import { toAscii } from '../format';
import { rasterCommands, type ReceiptImage } from './image';

export type Align = 'left' | 'center' | 'right';

export type ReceiptOp =
  | { kind: 'text'; text: string; align?: Align; bold?: boolean; tall?: boolean }
  | { kind: 'image'; image: ReceiptImage }
  | { kind: 'feed'; lines: number }
  | { kind: 'cut' }
  | { kind: 'drawer' };

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const CMD = {
  init: [ESC, 0x40],
  align: (a: Align) => [ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2],
  bold: (on: boolean) => [ESC, 0x45, on ? 1 : 0],
  /** GS ! n: bit 0-3 tinggi, bit 4-7 lebar. Hanya tinggi ganda agar lebar baris tetap. */
  size: (tall: boolean) => [GS, 0x21, tall ? 0x01 : 0x00],
  feed: (n: number) => [ESC, 0x64, Math.max(0, Math.min(255, n))],
  /** ESC J n: maju kertas n titik (jarak kecil di bawah logo). */
  feedDots: (n: number) => [ESC, 0x4a, Math.max(0, Math.min(255, n))],
  /** GS V 66 0: maju kertas lalu potong sebagian (printer dengan cutter). */
  cut: [GS, 0x56, 0x42, 0x00],
  /** ESC p 0 25 250: pulsa untuk membuka laci uang (jika printer punya port laci). */
  drawer: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

/** Mengubah daftar baris menjadi byte ESC/POS. Teks selalu ASCII. */
export function toEscPos(ops: ReceiptOp[]): Uint8Array {
  const out: number[] = [...CMD.init];
  let align: Align = 'left';
  let bold = false;
  let tall = false;
  const reset = () => {
    if (align !== 'left') out.push(...CMD.align((align = 'left')));
    if (bold) out.push(...CMD.bold((bold = false)));
    if (tall) out.push(...CMD.size((tall = false)));
  };

  for (const op of ops) {
    if (op.kind !== 'text') reset();
    switch (op.kind) {
      case 'text': {
        const a = op.align ?? 'left';
        if (a !== align) out.push(...CMD.align((align = a)));
        if (!!op.bold !== bold) out.push(...CMD.bold((bold = !!op.bold)));
        if (!!op.tall !== tall) out.push(...CMD.size((tall = !!op.tall)));
        const ascii = toAscii(op.text).replace(/\n/g, ' ');
        for (let i = 0; i < ascii.length; i++) out.push(ascii.charCodeAt(i));
        out.push(LF);
        break;
      }
      case 'image':
        // Rata tengah berlaku juga untuk raster di printer ESC/POS umumnya; reset() mengembalikan ke kiri.
        out.push(...CMD.align((align = 'center')));
        for (const b of rasterCommands(op.image)) out.push(b);
        out.push(...CMD.feedDots(12));
        break;
      case 'feed':
        out.push(...CMD.feed(op.lines));
        break;
      case 'cut':
        out.push(...CMD.cut);
        break;
      case 'drawer':
        out.push(...CMD.drawer);
        break;
    }
  }
  reset();
  return Uint8Array.from(out);
}

/** Pratinjau teks polos dengan lebar tetap (untuk layar dan cetak darurat browser). */
export function toPlainText(ops: ReceiptOp[], width: number): string {
  const lines: string[] = [];
  for (const op of ops) {
    if (op.kind === 'text') {
      const t = toAscii(op.text).replace(/\n/g, ' ').slice(0, width);
      const pad = width - t.length;
      if (op.align === 'center') lines.push(' '.repeat(Math.floor(pad / 2)) + t);
      else if (op.align === 'right') lines.push(' '.repeat(pad) + t);
      else lines.push(t);
    } else if (op.kind === 'image') {
      const label = '[ LOGO ]';
      lines.push(' '.repeat(Math.max(0, Math.floor((width - label.length) / 2))) + label);
    } else if (op.kind === 'feed') {
      for (let i = 0; i < op.lines; i++) lines.push('');
    }
  }
  return lines.join('\n');
}

/** base64 dari byte, dipakai untuk mengirim ke RawBT. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
