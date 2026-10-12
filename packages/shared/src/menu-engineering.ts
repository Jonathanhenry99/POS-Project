// Analisa menu (menu engineering, Kasavana & Smith): tiap menu dinilai dari popularitas dan margin per porsi.
// Murni: baris penjualan masuk, klasifikasi keluar.

export type MenuQuadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog';

export interface MenuSalesRow {
  productId: string;
  name: string;
  category: string;
  /** Harga jual di menu saat ini. */
  price: number;
  qty: number;
  amount: number;
  /** HPP resep dasar per porsi (0 bila resep belum diisi). */
  cost: number;
  recipeLines: number;
}

export interface MenuAnalysisRow extends MenuSalesRow {
  /** Harga rata-rata per porsi yang benar-benar terjual (termasuk varian), atau harga menu bila belum terjual. */
  unitPrice: number;
  unitMargin: number;
  marginPct: number;
  /** Porsi dari total item terjual (0-100). */
  mixPct: number;
  totalMargin: number;
  popular: boolean;
  profitable: boolean;
  quadrant: MenuQuadrant;
  hasCost: boolean;
}

export interface MenuAnalysis {
  rows: MenuAnalysisRow[];
  /** Ambang populer: 70% dari porsi rata-rata (100% / jumlah menu). */
  popularityThresholdPct: number;
  /** Ambang untung: margin rata-rata tertimbang per porsi. */
  marginThreshold: number;
  totalQty: number;
  /** Jumlah menu yang resep/HPP-nya belum diisi (marginnya dianggap = harga jual). */
  missingCost: number;
}

export const QUADRANT_LABEL: Record<MenuQuadrant, string> = { star: 'Bintang', plowhorse: 'Andalan', puzzle: 'Potensi', dog: 'Evaluasi' };

export const QUADRANT_ADVICE: Record<MenuQuadrant, string> = {
  star: 'Laris dan untung besar. Jaga kualitas & stok, tonjolkan di kasir.',
  plowhorse: 'Laris tapi margin tipis. Tinjau HPP/porsi atau naikkan harga sedikit.',
  puzzle: 'Untung besar tapi jarang dipesan. Promosikan, ubah nama/foto, tawarkan oleh kasir.',
  dog: 'Jarang dipesan dan margin tipis. Perbaiki resep/harga, atau pertimbangkan dihapus.',
};

export function analyzeMenu(sales: MenuSalesRow[]): MenuAnalysis {
  const totalQty = sales.reduce((n, r) => n + r.qty, 0);
  const base = sales.map((r) => {
    const unitPrice = r.qty > 0 ? Math.round(r.amount / r.qty) : r.price;
    const unitMargin = unitPrice - Math.round(r.cost);
    return { ...r, unitPrice, unitMargin, hasCost: r.recipeLines > 0, totalMargin: unitMargin * r.qty };
  });
  const popularityThresholdPct = sales.length ? (100 / sales.length) * 0.7 : 0;
  // Margin rata-rata tertimbang penjualan; bila belum ada penjualan, rata-rata sederhana.
  const marginThreshold = totalQty > 0 ? base.reduce((n, r) => n + r.totalMargin, 0) / totalQty : base.length ? base.reduce((n, r) => n + r.unitMargin, 0) / base.length : 0;
  const rows = base
    .map((r): MenuAnalysisRow => {
      const mixPct = totalQty > 0 ? (r.qty / totalQty) * 100 : 0;
      const popular = totalQty > 0 && mixPct >= popularityThresholdPct;
      const profitable = r.unitMargin >= marginThreshold;
      return {
        ...r,
        mixPct: Math.round(mixPct * 10) / 10,
        marginPct: r.unitPrice > 0 ? Math.round((r.unitMargin / r.unitPrice) * 1000) / 10 : 0,
        popular,
        profitable,
        quadrant: popular ? (profitable ? 'star' : 'plowhorse') : profitable ? 'puzzle' : 'dog',
      };
    })
    .sort((a, b) => b.totalMargin - a.totalMargin || b.qty - a.qty || a.name.localeCompare(b.name));
  return { rows, popularityThresholdPct: Math.round(popularityThresholdPct * 10) / 10, marginThreshold: Math.round(marginThreshold), totalQty, missingCost: rows.filter((r) => !r.hasCost).length };
}
