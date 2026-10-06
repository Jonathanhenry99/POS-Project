import { expect, it } from 'vitest';
import { checkerReceipt, DEFAULT_LAYOUT } from './receipts';
import { DEFAULT_SETTINGS } from '../defaults';
import { toPlainText } from './escpos';

it('checker membungkus nama/opsi/catatan 32/48 kolom, mencetak meja/pax, tanpa harga atau drawer', () => {
  for (const width of [32, 48]) {
    const ops = checkerReceipt({ station: 'DAPUR', customerName: 'Budi', tableName: 'Meja 2', pax: 3, orderType: 'Dine In', at: '2026-10-06T08:00:00Z' }, [{ name: 'Chicken Sandwich dengan saus tambahan panjang', qty: 2, options: [{ optionId: 'a', groupName: 'Saus', name: 'Extra Sambal', priceDelta: 5000 }], note: 'Saus dipisah dan tanpa sayur untuk alergi' }], DEFAULT_SETTINGS.store, { ...DEFAULT_LAYOUT, width, openDrawer: true });
    const text = toPlainText(ops, width);
    expect(text).toContain('Meja 2'); expect(text).toContain('Pax'); expect(text).toContain('Extra Sambal'); expect(text).not.toContain('5.000');
    expect(text.split('\n').every((l) => l.length <= width)).toBe(true); expect(ops.some((op) => op.kind === 'drawer')).toBe(false);
  }
});
