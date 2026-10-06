import { describe, expect, it } from 'vitest';
import { formatNumber, formatRupiah, toAscii } from '../format';
import { computeTotals, priceLine } from '../pricing';
import type { Order, OrderItem, Shift, StoreSettings } from '../types';
import { CMD, bytesToBase64, toEscPos, toPlainText } from './escpos';
import { twoCol, wrap } from './layout';
import { DEFAULT_LAYOUT, saleReceipt, shiftReceipt, testReceipt } from './receipts';

/** Baris dua kolom 32 karakter: kiri + spasi + kanan. */
const row = (left: string, right: string, width = 32) => left + ' '.repeat(width - left.length - right.length) + right;

const store: StoreSettings = {
  name: 'MOURDEN',
  address: 'Jl. Kopi Nikmat No. 12, Kelurahan Panjang Sekali, Jakarta Selatan',
  phone: '0812-3456-7890',
  footer: 'Terima kasih! Sampai jumpa lagi',
  timezone: 'Asia/Jakarta',
};

function item(name: string, basePrice: number, qty: number, extra: Partial<OrderItem> = {}): OrderItem {
  const options = extra.options ?? [];
  const { unitPrice, lineTotal } = priceLine(basePrice, options, qty);
  return { id: name, productId: name, name, basePrice, unitPrice, qty, options, note: '', lineTotal, ...extra };
}

function order(overrides: Partial<Order> = {}): Order {
  const items = overrides.items ?? [
    item('Es Kopi Susu Gula Aren Spesial Mourden Ukuran Besar', 28000, 2, {
      options: [
        { optionId: 'o1', groupName: 'Ukuran', name: 'Large', priceDelta: 5000 },
        { optionId: 'o2', groupName: 'Tambahan', name: 'Extra Shot', priceDelta: 6000 },
      ],
      note: 'less sugar, es dipisah',
    }),
    item('Croissant', 25000, 1),
  ];
  const discount = { type: 'percent' as const, value: 10, reason: 'Member' };
  const totals = computeTotals(items, discount, {
    serviceEnabled: true,
    servicePct: 5,
    taxEnabled: false,
    taxPct: 0,
    taxLabel: 'PB1',
    roundingMode: 'none',
    roundingUnit: 0,
  });
  return {
    id: 'ord-1',
    number: 'A261006-007',
    deviceId: 'dev',
    shiftId: 'shift',
    cashierId: 'u1',
    cashierName: 'Rina',
    createdAt: '2026-10-06T07:05:00.000Z',
    customerName: 'Budi',
    orderType: 'dine_in',
    items,
    discount,
    servicePct: 5,
    taxPct: 0,
    taxLabel: 'PB1',
    ...totals,
    payment: { method: 'cash', amount: totals.total, tendered: 150000, change: 150000 - totals.total, reference: '' },
    status: 'paid',
    voidReason: '',
    voidedAt: null,
    voidedById: null,
    voidedByName: '',
    voidApprovedById: null,
    ...overrides,
  };
}

describe('format rupiah', () => {
  it('memakai titik sebagai pemisah ribuan', () => {
    expect(formatRupiah(25000)).toBe('Rp 25.000');
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(500)).toBe('Rp 500');
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(-7400)).toBe('-Rp 7.400');
    expect(formatNumber(-7400)).toBe('-7.400');
    expect(formatNumber(1000000)).toBe('1.000.000');
  });
});

describe('toAscii', () => {
  it('membuang aksen, emoji, dan karakter khusus', () => {
    expect(toAscii('Café Crème “Spesial” – 2')).toBe('Cafe Creme "Spesial" - 2');
    expect(wrap('Teh 🍵 Manis', 32)).toEqual(['Teh Manis']);
  });
});

describe('wrap & twoCol', () => {
  it('membungkus nama panjang per kata tanpa melebihi lebar', () => {
    const lines = wrap('Es Kopi Susu Gula Aren Spesial Mourden Ukuran Besar', 32);
    expect(lines).toEqual(['Es Kopi Susu Gula Aren Spesial', 'Mourden Ukuran Besar']);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(32));
  });

  it('memotong paksa kata yang lebih panjang dari satu baris', () => {
    const lines = wrap('A'.repeat(40) + ' B', 32);
    expect(lines).toEqual(['A'.repeat(32), 'A'.repeat(8) + ' B']);
  });

  it('meletakkan harga rata kanan tepat 32 karakter', () => {
    expect(twoCol('Subtotal', '106.000', 32)).toEqual(['Subtotal                 106.000']);
    const long = twoCol('Es Kopi Susu Gula Aren Spesial Mourden', '1.250.000', 32);
    expect(long.length).toBe(2);
    long.forEach((l) => expect(l.length).toBeLessThanOrEqual(32));
    expect(long[1].endsWith('1.250.000')).toBe(true);
    expect(long[1].length).toBe(32);
  });
});

describe('saleReceipt', () => {
  it('tidak ada baris yang melebihi 32 karakter', () => {
    const text = toPlainText(saleReceipt(order(), store, DEFAULT_LAYOUT), 32);
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(32);
  });

  it('berisi angka yang benar dan format rupiah', () => {
    const o = order();
    // (28.000 + 5.000 + 6.000) x 2 = 78.000; + 25.000 = 103.000
    expect(o.subtotal).toBe(103000);
    expect(o.discountAmount).toBe(10300);
    expect(o.serviceAmount).toBe(4635); // 5% x 92.700
    expect(o.total).toBe(97335);
    const text = toPlainText(saleReceipt(o, store, DEFAULT_LAYOUT), 32);
    expect(text).toContain('No    : A261006-007');
    expect(text).toContain('Waktu : 06/10/2026 14:05'); // UTC 07:05 = WIB 14:05
    expect(text).toContain(row('  2 x 39.000', '78.000'));
    expect(text).toContain('Large, Extra Shot');
    expect(text).toContain('Ctt: less sugar, es dipisah');
    expect(text).toContain(row('Diskon 10%', '-10.300'));
    expect(text).toContain(row('Service 5%', '4.635'));
    expect(text).toContain(row('TOTAL', 'Rp 97.335'));
    expect(text).toContain(row('Tunai', 'Rp 150.000'));
    expect(text).toContain(row('Kembali', 'Rp 52.665'));
  });

  it('menandai cetak ulang dan transaksi batal', () => {
    expect(toPlainText(saleReceipt(order(), store, DEFAULT_LAYOUT, { reprint: true }), 32)).toContain('CETAK ULANG');
    const voided = toPlainText(saleReceipt(order({ status: 'void', voidReason: 'Salah input' }), store, DEFAULT_LAYOUT), 32);
    expect(voided).toContain('DIBATALKAN');
    expect(voided).toContain('Alasan batal: Salah input');
  });

  it('menampilkan tipe pesanan', () => {
    expect(toPlainText(saleReceipt(order(), store, DEFAULT_LAYOUT), 32)).toContain('DINE IN');
    expect(toPlainText(saleReceipt(order({ orderType: 'take_away' }), store, DEFAULT_LAYOUT), 32)).toContain('TAKE AWAY');
  });

  it('tagihan sebelum bayar tanpa nomor dan tanpa info pembayaran', () => {
    const text = toPlainText(saleReceipt(order(), store, DEFAULT_LAYOUT, { bill: true }), 32);
    expect(text).toContain('TAGIHAN - BELUM DIBAYAR');
    expect(text).toContain(row('TOTAL', 'Rp 97.335'));
    expect(text).not.toContain('A261006-007');
    expect(text).not.toContain('Kembali');
    text.split('\n').forEach((l) => expect(l.length).toBeLessThanOrEqual(32));
  });

  it('pembayaran non-tunai menampilkan metode dan referensi', () => {
    const o = order();
    const text = toPlainText(
      saleReceipt({ ...o, payment: { method: 'qris', amount: o.total, tendered: o.total, change: 0, reference: 'QR123' } }, store, DEFAULT_LAYOUT),
      32,
    );
    expect(text).toContain(row('QRIS', 'Rp 97.335'));
    expect(text).toContain('Ref   : QR123');
    expect(text).not.toContain('Kembali');
  });

  it('mendukung kertas 80 mm (48 karakter)', () => {
    const text = toPlainText(saleReceipt(order(), store, { ...DEFAULT_LAYOUT, width: 48 }), 48);
    const lines = text.split('\n');
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(48));
    expect(lines).toContain('-'.repeat(48));
  });
});

describe('toEscPos (urutan byte)', () => {
  it('diawali ESC @ dan berisi perintah rata tengah, tebal, tinggi ganda', () => {
    const bytes = toEscPos(saleReceipt(order(), store, DEFAULT_LAYOUT));
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    // header: rata tengah -> tebal -> tinggi ganda -> "MOURDEN" -> LF
    const expectedHeader = [
      ...CMD.init,
      ...CMD.align('center'),
      ...CMD.bold(true),
      ...CMD.size(true),
      ...Array.from('MOURDEN', (c) => c.charCodeAt(0)),
      0x0a,
    ];
    expect([...bytes.slice(0, expectedHeader.length)]).toEqual(expectedHeader);
  });

  it('diakhiri feed tanpa cut secara default, dan cut bila diaktifkan', () => {
    const plain = toEscPos(saleReceipt(order(), store, DEFAULT_LAYOUT));
    expect([...plain.slice(-3)]).toEqual([0x1b, 0x64, 4]);
    const withCut = toEscPos(saleReceipt(order(), store, { ...DEFAULT_LAYOUT, cut: true }));
    expect([...withCut.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('membuka laci hanya untuk transaksi tunai baru bila diaktifkan', () => {
    const has = (b: Uint8Array) => Buffer.from(b).includes(Buffer.from(CMD.drawer));
    const layout = { ...DEFAULT_LAYOUT, openDrawer: true };
    expect(has(toEscPos(saleReceipt(order(), store, layout)))).toBe(true);
    expect(has(toEscPos(saleReceipt(order(), store, layout, { reprint: true })))).toBe(false);
    expect(has(toEscPos(saleReceipt(order(), store, DEFAULT_LAYOUT)))).toBe(false);
  });

  it('hanya menghasilkan byte ASCII untuk teks', () => {
    const o = order({ customerName: 'José ☕' });
    const bytes = toEscPos(saleReceipt(o, store, DEFAULT_LAYOUT));
    expect(Buffer.from(bytes).toString('latin1')).toContain('Nama  : Jose');
    expect([...bytes].every((b) => b < 0x80 || b === 0xfa)).toBe(true);
  });

  it('mengembalikan format ke normal di akhir', () => {
    const bytes = toEscPos([{ kind: 'text', text: 'X', align: 'right', bold: true, tall: true }]);
    expect([...bytes]).toEqual([
      ...CMD.init,
      ...CMD.align('right'),
      ...CMD.bold(true),
      ...CMD.size(true),
      0x58,
      0x0a,
      ...CMD.align('left'),
      ...CMD.bold(false),
      ...CMD.size(false),
    ]);
  });

  it('base64 sesuai dengan byte asli', () => {
    const bytes = toEscPos(testReceipt(store, DEFAULT_LAYOUT, 'RawBT', '2026-10-06T07:05:00.000Z'));
    expect(Buffer.from(bytesToBase64(bytes), 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});

describe('testReceipt & shiftReceipt', () => {
  it('struk tes pas 32 karakter', () => {
    const text = toPlainText(testReceipt(store, DEFAULT_LAYOUT, 'RawBT', '2026-10-06T07:05:00.000Z'), 32);
    expect(text).toContain('12345678901234567890123456789012');
    text.split('\n').forEach((l) => expect(l.length).toBeLessThanOrEqual(32));
  });

  it('rekap shift menampilkan selisih kas', () => {
    const shift: Shift = {
      id: 's',
      deviceId: 'd',
      openedById: 'u',
      openedByName: 'Rina',
      openedAt: '2026-10-06T01:00:00.000Z',
      openingCash: 200000,
      cashMovements: [{ id: 'm', type: 'out', amount: 15000, note: 'Beli es batu', at: '', userName: 'Rina' }],
      closedById: 'u',
      closedByName: 'Rina',
      closedAt: '2026-10-06T14:00:00.000Z',
      countedCash: 480000,
      closingNote: '',
      summary: {
        orderCount: 10,
        voidCount: 1,
        voidAmount: 25000,
        grossSales: 500000,
        discountTotal: 0,
        serviceTotal: 25000,
        taxTotal: 0,
        netSales: 525000,
        byMethod: { cash: 300000, qris: 200000, card: 25000 },
        cashIn: 0,
        cashOut: 15000,
        expectedCash: 485000,
      },
    };
    const text = toPlainText(shiftReceipt(shift, store, DEFAULT_LAYOUT), 32);
    expect(text).toContain(row('Kas seharusnya', '485.000'));
    expect(text).toContain(row('Selisih (kurang)', '-5.000'));
    expect(text).toContain(row('  - Beli es batu', '-15.000'));
    text.split('\n').forEach((l) => expect(l.length).toBeLessThanOrEqual(32));
  });
});
