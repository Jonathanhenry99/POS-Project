// Selisih bahan: bahan yang hilang menurut opname dibandingkan dengan pemakaian yang tercatat.
// Prinsip: setiap bahan yang keluar harus tercatat sebagai penjualan, komplimen, atau terbuang.
// Sisanya = selisih tak tercatat, dinilai wajar/abnormal terhadap toleransi. Murni, tanpa efek samping.

export interface VarianceInput {
  ingredientId: string;
  name: string;
  unit: string;
  station: string;
  costPerUnit: number;
  /** Toleransi khusus bahan (%), null = bawaan. */
  tolerancePct: number | null;
  /** Pemakaian menurut resep dari penjualan lunas. */
  soldQty: number;
  /** Pemakaian menurut resep dari komplimen karyawan. */
  compQty: number;
  /** Terbuang/rusak yang dicatat. */
  wasteQty: number;
  /** Jumlah selisih opname (hitung fisik - sistem). Negatif = bahan hilang. */
  opnameDiff: number;
  /** Berapa kali bahan ini dihitung di periode ini. */
  opnameCount: number;
}

export type VarianceStatus = 'wajar' | 'abnormal' | 'lebih' | 'belum_opname';

export interface VarianceRow extends VarianceInput {
  /** Pemakaian tercatat = penjualan + komplimen. */
  usageQty: number;
  /** Hilang tanpa catatan (positif) atau lebih (negatif). */
  unexplainedQty: number;
  /** Selisih tak tercatat sebagai % dari pemakaian. null bila tidak ada pemakaian. */
  variancePct: number | null;
  tolerance: number;
  /** Batas wajar dalam satuan bahan. */
  allowedQty: number;
  status: VarianceStatus;
  /** Nilai rupiah bahan yang hilang tanpa catatan (0 bila tidak hilang). */
  lossValue: number;
  /** Bagian yang melewati batas wajar, dalam rupiah. */
  excessValue: number;
}

export interface VarianceReport {
  rows: VarianceRow[];
  defaultTolerancePct: number;
  totals: { lossValue: number; excessValue: number; wasteValue: number; compValue: number; abnormal: number; notCounted: number };
}

export const VARIANCE_LABEL: Record<VarianceStatus, string> = { wajar: 'Wajar', abnormal: 'Abnormal', lebih: 'Lebih', belum_opname: 'Belum dihitung' };

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function analyzeVariance(inputs: VarianceInput[], defaultTolerancePct: number): VarianceReport {
  const rows = inputs.map((r): VarianceRow => {
    const usageQty = round(r.soldQty + r.compQty);
    const unexplainedQty = round(0 - r.opnameDiff);
    const tolerance = r.tolerancePct ?? defaultTolerancePct;
    const allowedQty = round((usageQty * tolerance) / 100);
    const variancePct = usageQty > 0 ? Math.round((unexplainedQty / usageQty) * 1000) / 10 : null;
    let status: VarianceStatus;
    if (r.opnameCount === 0) status = 'belum_opname';
    // Sedikit di atas batas karena pembulatan timbangan tidak dihitung abnormal.
    else if (unexplainedQty > allowedQty + 1e-6) status = 'abnormal';
    else if (unexplainedQty < -allowedQty - 1e-6) status = 'lebih';
    else status = 'wajar';
    const missing = Math.max(0, unexplainedQty);
    return {
      ...r,
      usageQty,
      unexplainedQty,
      variancePct,
      tolerance,
      allowedQty,
      status,
      lossValue: Math.round(missing * r.costPerUnit),
      excessValue: status === 'abnormal' ? Math.round((missing - allowedQty) * r.costPerUnit) : 0,
    };
  });
  const rank: Record<VarianceStatus, number> = { abnormal: 0, lebih: 1, belum_opname: 2, wajar: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.lossValue - a.lossValue || a.name.localeCompare(b.name));
  return {
    rows,
    defaultTolerancePct,
    totals: {
      lossValue: rows.reduce((n, r) => n + r.lossValue, 0),
      excessValue: rows.reduce((n, r) => n + r.excessValue, 0),
      wasteValue: Math.round(rows.reduce((n, r) => n + r.wasteQty * r.costPerUnit, 0)),
      compValue: Math.round(rows.reduce((n, r) => n + r.compQty * r.costPerUnit, 0)),
      abnormal: rows.filter((r) => r.status === 'abnormal').length,
      notCounted: rows.filter((r) => r.status === 'belum_opname' && r.usageQty > 0).length,
    },
  };
}
