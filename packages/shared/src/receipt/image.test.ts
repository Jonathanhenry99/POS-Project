import { describe, expect, it } from 'vitest';
import { contentBounds, imageBytes, logoBox, paperDots, rasterCommands, rasterize, RASTER_BAND } from './image';

/** RGBA dari pola teks: '#' hitam, '.' putih, ' ' transparan. */
function pixels(rows: string[]) {
  const w = rows[0].length;
  const out = new Uint8ClampedArray(w * rows.length * 4);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const i = (y * w + x) * 4;
    const v = ch === '#' ? 0 : 255;
    out.set([v, v, v, ch === ' ' ? 0 : 255], i);
  }));
  return { data: out, width: w, height: rows.length };
}

describe('logo struk', () => {
  it('lebar logo kelipatan 8 dan tidak melebihi kertas', () => {
    expect(paperDots(32)).toBe(384);
    expect(paperDots(48)).toBe(576);
    for (const size of ['small', 'medium', 'large'] as const) {
      const box = logoBox(size, 32);
      expect(box.width % 8).toBe(0);
      expect(box.width).toBeLessThanOrEqual(384);
    }
    expect(logoBox('small', 32).width).toBeLessThan(logoBox('large', 32).width);
  });

  it('memangkas margin putih dan transparan', () => {
    const p = pixels(['    ....', '  .##...', '  ..#...', '........']);
    expect(contentBounds(p.data, p.width, p.height)).toEqual({ x: 3, y: 1, width: 2, height: 2 });
    const blank = pixels(['....', '    ']);
    expect(contentBounds(blank.data, blank.width, blank.height)).toBeNull();
  });

  it('mengemas piksel menjadi bit (MSB = kiri), transparan dianggap putih', () => {
    const p = pixels(['#.#.....#', '  ######.']);
    const img = rasterize(p.data, p.width, p.height, 128);
    expect(img.width).toBe(9);
    expect([...imageBytes(img)]).toEqual([0b10100000, 0b10000000, 0b00111111, 0b00000000]);
  });

  it('GS v 0 dipotong per band dengan header yang benar', () => {
    const height = RASTER_BAND * 2 + 8;
    const p = pixels(Array.from({ length: height }, () => '#'.repeat(16)));
    const img = rasterize(p.data, 16, height, 128);
    const cmd = rasterCommands(img);
    expect(cmd.slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, RASTER_BAND, 0]);
    expect(cmd.length).toBe(3 * 8 + 2 * height);
    const last = 2 * (8 + 2 * RASTER_BAND);
    expect(cmd.slice(last, last + 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 8, 0]);
  });
});
