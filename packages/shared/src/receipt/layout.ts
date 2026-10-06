// Helper tata letak teks untuk struk berlebar tetap (58 mm = 32 karakter).
import { toAscii } from '../format';

/** Membungkus teks per kata. Kata yang lebih panjang dari lebar baris dipotong paksa. */
export function wrap(text: string, width: number): string[] {
  const clean = toAscii(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const lines: string[] = [];
  let line = '';
  for (let word of clean.split(' ')) {
    while (word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Membungkus teks dengan indentasi di setiap baris. */
export function wrapIndented(text: string, width: number, indent: number): string[] {
  const pad = ' '.repeat(indent);
  return wrap(text, width - indent).map((l) => pad + l);
}

/**
 * Dua kolom: teks kiri dan teks kanan rata kanan.
 * Bila kiri terlalu panjang, kiri dibungkus dan teks kanan diletakkan di baris terakhir.
 */
export function twoCol(left: string, right: string, width: number): string[] {
  const r = toAscii(right).trim().slice(0, width);
  const leftWidth = width - r.length - 1;
  if (leftWidth < 4) return [...wrap(left, width), r.padStart(width)];
  const indent = left.length - left.trimStart().length;
  const lines = indent > 0 && leftWidth - indent >= 4 ? wrapIndented(left, leftWidth, indent) : wrap(left, leftWidth);
  const last = lines.pop() ?? '';
  return [...lines, last + ' '.repeat(width - last.length - r.length) + r];
}

export function rule(width: number, ch = '-'): string {
  return ch.repeat(width);
}
