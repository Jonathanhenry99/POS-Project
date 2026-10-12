// Hitung opname dengan kemasan: barista mengisi jumlah kemasan segel dan berat timbangan bahan terbuka
// BERSAMA wadahnya; sistem mengalikan isi bersih dan memotong berat wadah. Bahan cair: 1 gr dianggap 1 ml.

export interface PackagingConfig {
  /** Isi bersih satu kemasan segel dalam satuan bahan (mis. 946 untuk susu 946 ml). 0 = tidak dipakai. */
  packSize: number;
  /** Berat satu wadah/kemasan kosong dalam satuan bahan. 0 = tidak dipotong. */
  containerWeight: number;
}

export interface CountBreakdown {
  /** Jumlah kemasan yang masih segel. */
  sealed: number;
  /** Total berat timbangan bahan terbuka, termasuk wadahnya. */
  gross: number;
  /** Berapa wadah yang ikut ditimbang (minimal 1 bila ada berat). */
  containers: number;
}

export interface CountResult {
  /** Jumlah bersih dalam satuan bahan. */
  qty: number;
  sealedQty: number;
  openQty: number;
  tare: number;
  /** Terisi bila angka tidak masuk akal (mis. berat timbangan lebih kecil dari berat wadah). */
  error: string;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function usesPackaging(cfg: PackagingConfig): boolean {
  return cfg.packSize > 0 || cfg.containerWeight > 0;
}

export function countFromBreakdown(b: CountBreakdown, cfg: PackagingConfig): CountResult {
  const sealed = Math.max(0, b.sealed || 0);
  const gross = Math.max(0, b.gross || 0);
  const containers = gross > 0 ? Math.max(1, Math.round(b.containers || 1)) : 0;
  const tare = round3(cfg.containerWeight * containers);
  const sealedQty = round3(sealed * cfg.packSize);
  let error = '';
  if (sealed > 0 && cfg.packSize <= 0) error = 'Isi per kemasan belum diatur untuk bahan ini';
  else if (!Number.isInteger(sealed)) error = 'Jumlah kemasan segel harus bilangan bulat';
  else if (gross > 0 && gross < tare) error = `Berat timbangan lebih kecil dari berat ${containers} wadah (${tare})`;
  const openQty = round3(Math.max(0, gross - tare));
  return { qty: round3(sealedQty + openQty), sealedQty, openQty, tare, error };
}
