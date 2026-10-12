import { describe, expect, it } from 'vitest';
import { analyzeMenu, type MenuSalesRow } from './menu-engineering';

const row = (name: string, price: number, qty: number, cost: number): MenuSalesRow => ({ productId: name, name, category: 'Kopi', price, qty, amount: price * qty, cost, recipeLines: cost > 0 ? 2 : 0 });

describe('analisa menu', () => {
  const a = analyzeMenu([
    row('Kopi Susu', 28000, 60, 9000), // laris, margin 19.000
    row('Americano', 25000, 30, 11000), // laris, margin 14.000
    row('Affogato', 40000, 6, 12000), // jarang, margin 28.000
    row('Teh', 15000, 4, 9000), // jarang, margin 6.000
  ]);
  const q = (name: string) => a.rows.find((r) => r.name === name)!.quadrant;

  it('ambang populer 70% dari porsi rata-rata; ambang untung = margin rata-rata tertimbang', () => {
    expect(a.totalQty).toBe(100);
    expect(a.popularityThresholdPct).toBe(17.5);
    expect(a.marginThreshold).toBe(Math.round((60 * 19000 + 30 * 14000 + 6 * 28000 + 4 * 6000) / 100));
  });

  it('membagi menu ke empat kuadran', () => {
    expect(q('Kopi Susu')).toBe('star');
    expect(q('Americano')).toBe('plowhorse');
    expect(q('Affogato')).toBe('puzzle');
    expect(q('Teh')).toBe('dog');
  });

  it('menu tanpa resep ditandai dan margin dianggap harga jual; tanpa penjualan tidak ada yang populer', () => {
    const b = analyzeMenu([row('A', 20000, 0, 0), row('B', 30000, 0, 5000)]);
    expect(b.missingCost).toBe(1);
    expect(b.rows.every((r) => !r.popular && r.mixPct === 0)).toBe(true);
    expect(b.rows.find((r) => r.name === 'A')!.unitMargin).toBe(20000);
    expect(analyzeMenu([]).rows).toEqual([]);
  });

  it('memakai harga rata-rata yang benar-benar terjual (varian lebih mahal ikut terhitung)', () => {
    const c = analyzeMenu([{ ...row('Latte', 25000, 10, 8000), amount: 290000 }]);
    expect(c.rows[0].unitPrice).toBe(29000);
    expect(c.rows[0].unitMargin).toBe(21000);
  });
});
