// Membuat ikon PWA (PNG) tanpa dependensi: cangkir kopi krem di atas latar espresso.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x2b, 0x1d, 0x16];
const FG = [0xf3, 0xe3, 0xcf];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Signed distance functions dalam koordinat 0..1
const box = (px, py, cx, cy, hw, hh, r) => {
  const dx = Math.abs(px - cx) - hw + r, dy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const ring = (px, py, cx, cy, rad, w) => Math.abs(Math.hypot(px - cx, py - cy) - rad) - w;

function cup(u, v) {
  const body = box(u, v, 0.45, 0.55, 0.19, 0.17, 0.06);
  const handle = Math.max(ring(u, v, 0.66, 0.53, 0.075, 0.025), -(u - 0.62));
  const saucer = box(u, v, 0.47, 0.765, 0.27, 0.025, 0.025);
  const steam1 = box(u, v, 0.38, 0.28, 0.018, 0.06, 0.018);
  const steam2 = box(u, v, 0.47, 0.25, 0.018, 0.08, 0.018);
  const steam3 = box(u, v, 0.56, 0.28, 0.018, 0.06, 0.018);
  return Math.min(body, handle, saucer, steam1, steam2, steam3);
}

function render(size, { maskable }) {
  const scale = maskable ? 0.72 : 0.86;
  return png(size, (x, y) => {
    const u0 = x / size, v0 = y / size;
    const px = 1 / size;
    const bgD = maskable ? -1 : box(u0, v0, 0.5, 0.5, 0.5, 0.5, 0.22);
    const bgA = Math.min(1, Math.max(0, 0.5 - bgD / px));
    const u = (u0 - 0.5) / scale + 0.5, v = (v0 - 0.5) / scale + 0.5;
    const d = cup(u, v) * scale;
    const fgA = Math.min(1, Math.max(0, 0.5 - d / px));
    const c = BG.map((b, i) => Math.round(b + (FG[i] - b) * fgA));
    return [...c, Math.round(255 * bgA)];
  });
}

writeFileSync('public/icon-192.png', render(192, { maskable: false }));
writeFileSync('public/icon-512.png', render(512, { maskable: false }));
writeFileSync('public/icon-maskable-512.png', render(512, { maskable: true }));
console.log('Ikon dibuat di public/');
