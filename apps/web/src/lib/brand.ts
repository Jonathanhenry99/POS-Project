// Logo toko: tampilan di aplikasi (login, kasir, admin) dan bitmap hitam-putih untuk struk.
import { DARKNESS_THRESHOLD, contentBounds, logoBox, rasterize, type ReceiptImage, type ReceiptSettings } from '@mourden/shared';
import { api } from './api';
import { appStore } from './state';
import { createStore, useStore } from './store';

/** Logo bawaan (ikut di-cache service worker, jadi tetap tampil & tercetak saat offline). */
export const DEFAULT_LOGO = '/brand/logo.png';
const LOGO_KEY = 'mourden.brand-logo';

function readCached(): string {
  try {
    return localStorage.getItem(LOGO_KEY) ?? '';
  } catch {
    return '';
  }
}

/** logo = unggahan owner (data URL), '' = bawaan. Disimpan lokal supaya layar login langsung tampil benar. */
export const brandStore = createStore<{ logo: string }>({ logo: readCached() });

export const useBrandLogo = () => useStore(brandStore, (s) => s.logo) || DEFAULT_LOGO;

export function setBrandLogo(logo: string) {
  if (brandStore.get().logo === logo) return;
  brandStore.set({ logo });
  try {
    if (logo) localStorage.setItem(LOGO_KEY, logo);
    else localStorage.removeItem(LOGO_KEY);
  } catch {
    /* tetap berlaku selama aplikasi terbuka */
  }
}

/** Tablet: logo ikut data bootstrap. HP/login: ambil dari server bila online. */
export function initBrand() {
  let last: unknown = null;
  appStore.subscribe(() => {
    const brand = appStore.get().data?.settings.brand;
    if (brand && brand !== last) {
      last = brand;
      setBrandLogo(brand.logo);
    }
  });
  api<{ logo: string }>('/brand', { timeoutMs: 8000 })
    .then((r) => setBrandLogo(r.logo))
    .catch(() => {});
}

// ---------- Pengolahan gambar ----------

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Piksel gambar, sisi terpanjang dibatasi agar ringan di tablet. */
function pixelsOf(img: HTMLImageElement, max = 1024) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, data: g.getImageData(0, 0, canvas.width, canvas.height).data };
}

const MAX_LOGO_DATA_URL = 380_000;

/** Logo unggahan: margin kosong dipangkas, diperkecil, lalu disimpan sebagai PNG (WebP bila PNG terlalu besar). */
export async function prepareLogoUpload(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Pilih gambar PNG, JPG atau WebP');
  if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran file maksimal 15 MB');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url).catch(() => {
      throw new Error('Gambar tidak bisa dibaca');
    });
    const { canvas, data } = pixelsOf(img);
    const box = contentBounds(data, canvas.width, canvas.height);
    if (!box) throw new Error('Gambar tampak kosong (putih/transparan semua)');
    const pad = Math.round(Math.max(box.width, box.height) * 0.04);
    const s = Math.min(1, 480 / (Math.max(box.width, box.height) + 2 * pad));
    const out = document.createElement('canvas');
    out.width = Math.round((box.width + 2 * pad) * s);
    out.height = Math.round((box.height + 2 * pad) * s);
    const g = out.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, box.x, box.y, box.width, box.height, pad * s, pad * s, box.width * s, box.height * s);
    let dataUrl = out.toDataURL('image/png');
    if (dataUrl.length > MAX_LOGO_DATA_URL) dataUrl = out.toDataURL('image/webp', 0.9);
    if (dataUrl.length > MAX_LOGO_DATA_URL) throw new Error('Logo terlalu detail. Coba gambar yang lebih sederhana atau berlatar polos.');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const rasterCache = new Map<string, ReceiptImage | null>();

/**
 * Bitmap logo untuk struk sesuai ukuran/ketebalan dan lebar kertas. Hasil di-cache,
 * jadi saat kasir menekan cetak, logo sudah siap tanpa jeda.
 */
export async function receiptLogoFor(src: string, format: ReceiptSettings, widthChars: number): Promise<ReceiptImage | null> {
  if (!format.showLogo) return null;
  const key = `${format.logoSize}|${format.logoDarkness}|${widthChars}|${src}`;
  const hit = rasterCache.get(key);
  if (hit !== undefined) return hit;
  let result: ReceiptImage | null;
  try {
    const { canvas, data } = pixelsOf(await loadImage(src));
    const box = contentBounds(data, canvas.width, canvas.height);
    if (!box) {
      result = null;
    } else {
      const limit = logoBox(format.logoSize, widthChars);
      const s = Math.min(limit.width / box.width, limit.maxHeight / box.height);
      const w = Math.max(8, Math.round(box.width * s));
      const h = Math.max(1, Math.round(box.height * s));
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const g = out.getContext('2d', { willReadFrequently: true })!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.imageSmoothingQuality = 'high';
      g.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, w, h);
      result = rasterize(g.getImageData(0, 0, w, h).data, w, h, DARKNESS_THRESHOLD[format.logoDarkness]);
    }
  } catch {
    // Gagal memuat (mis. file rusak): struk tetap tercetak dengan nama toko. Tidak di-cache supaya dicoba lagi.
    return null;
  }
  if (rasterCache.size >= 8) rasterCache.clear();
  rasterCache.set(key, result);
  return result;
}
