// Foto bukti (struk settlement, uang tunai): diperkecil & dikompres di perangkat sebelum disimpan/dikirim,
// supaya ringan di tablet 4GB, antrean offline, dan database.

const MAX_CHARS = 600_000;

function draw(img: HTMLImageElement, maxSide: number, quality: number): string {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** JPEG data URL, sisi terpanjang <= 1280 px. Diturunkan bertahap bila masih terlalu besar. */
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih berkas foto');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('Foto tidak bisa dibaca');
    });
    for (const [side, q] of [[1280, 0.72], [1024, 0.6], [800, 0.5]] as const) {
      const out = draw(img, side, q);
      if (out.length <= MAX_CHARS) return out;
    }
    throw new Error('Foto terlalu besar, coba ambil ulang');
  } finally {
    URL.revokeObjectURL(url);
  }
}
