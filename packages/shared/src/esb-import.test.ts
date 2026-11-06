import { describe, expect, it } from 'vitest';
import { allocateDay, ESB_UNKNOWN_LINE, esbMenuKey, esbPaymentMethod, localToUtcIso, parseEsbSheet, readXlsxRows, suggestProduct, type EsbMenuLine } from './esb-import';

// ---- Pembuat .xlsx kecil untuk tes (zip dengan entri simpan & deflate), meniru bentuk ekspor ESB.

const enc = new TextEncoder();

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zip(files: Record<string, string>, deflate: boolean): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content);
    const body = deflate ? await deflateRaw(raw) : raw;
    const n = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, n.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(10, deflate ? 8 : 0, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, n.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, body);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + body.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const col = (i: number) => String.fromCharCode(65 + i);
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Sheet dengan teks inline (seperti laporan detail ESB) atau sharedStrings (seperti laporan menu). */
async function xlsx(rows: (string | number | null)[][], opts: { shared: boolean; deflate: boolean }): Promise<Uint8Array> {
  const strings: string[] = [];
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === null) return '';
          const ref = `${col(ci)}${ri + 1}`;
          if (typeof v === 'number') return `<c r="${ref}" t="n"><v>${v}</v></c>`;
          if (opts.shared) {
            strings.push(v);
            return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const files: Record<string, string> = {
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Report" sheetId="1" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  if (opts.shared) files['xl/sharedStrings.xml'] = `<sst>${strings.map((s) => `<si><t>${xmlEsc(s)}</t></si>`).join('')}</sst>`;
  return zip(files, opts.deflate);
}

const DETAIL_HEAD = ['No Transaksi', 'Bill Number', 'Sales In Date', 'Sales In Time', 'Sales Out Date', 'Sales Out Time', 'Mode Penjualan', 'Table', 'Metode Pembayaran', 'Sales Type', 'Subtotal', 'Diskon Menu', 'Diskon Nota', 'Net Sales', 'Service Charge Total', 'Pajak Total', 'Biaya Pengiriman', 'Biaya Pemesanan', 'Rounding Total', 'Grand Total'];
// 46327 = 1 Nov 2026 (seri Excel)
const tx = (no: string, time: string, method: string, subtotal: number, service = 0, rounding = 0) =>
  [`S${no}`, `B${no}`, 46327, time, 46327, time, 'Dine In', 'Quick Service', method, 'Sales', subtotal, 0, 0, subtotal, service, 0, 0, 0, rounding, subtotal + service + rounding];

describe('readXlsxRows + parseEsbSheet', () => {
  it('membaca laporan detail ESB (teks inline, deflate)', async () => {
    const rows = [['Sales Detail'], ['Mourden'], [], ['Periode', '01-11-2026 - 01-11-2026'], [], DETAIL_HEAD, tx('1', '12:01:05', 'EDC Mandiri (POS)', 26000, 1300, 200), tx('2', '15:30:11', 'Cash (POS)', 22000)];
    const f = parseEsbSheet(await readXlsxRows(await xlsx(rows, { shared: false, deflate: true })));
    expect(f.kind).toBe('detail');
    if (f.kind !== 'detail') return;
    expect(f.from).toBe('2026-11-01');
    expect(f.transactions).toHaveLength(2);
    expect(f.transactions[0]).toMatchObject({ ref: 'S1', bill: 'B1', date: '2026-11-01', paidAt: '2026-11-01T12:01:05', orderType: 'dine_in', table: '', subtotal: 26000, service: 1300, rounding: 200, total: 27500 });
    expect(esbPaymentMethod(f.transactions[0].method)).toBe('card');
    expect(esbPaymentMethod(f.transactions[1].method)).toBe('cash');
  });

  it('membaca laporan menu per hari (sharedStrings, tanpa kompresi) dan melewati menu yang tidak terjual', async () => {
    const rows = [[], [], [], [null, null, null, null, 'LAPORAN MENU SUMMARY'], [null, null, null, null, 'PERIODE : 01 NOV 2026 - 01 NOV 2026'], [], [], ['Cabang', 'Menu', 'Kategori', 'Sub Kategori', 'Jumlah Terjual', 'Persentase', 'Jumlah Transaksi', 'Persentase', 'Penjualan'], ['Mourden', 'Butterscotch Latte', 'Minuman', 'White Coffee', 2, '5%', 1, '3%', 52000], ['Mourden', 'Es Kopi Susu & Gula', 'Minuman', 'White Coffee', 1, '2%', 1, '3%', 24000], ['Mourden', 'Brownies', 'Pastry', 'Brownies', 0, '0%', 0, '0%', 0]];
    const f = parseEsbSheet(await readXlsxRows(await xlsx(rows, { shared: true, deflate: false })));
    expect(f).toEqual({
      kind: 'menu',
      from: '2026-11-01',
      to: '2026-11-01',
      lines: [
        { name: 'Butterscotch Latte', category: 'Minuman', sub: 'White Coffee', qty: 2, bills: 1, amount: 52000 },
        { name: 'Es Kopi Susu & Gula', category: 'Minuman', sub: 'White Coffee', qty: 1, bills: 1, amount: 24000 },
      ],
    });
  });

  it('menolak berkas yang bukan Excel dan mengenali sheet lain sebagai unknown', async () => {
    await expect(readXlsxRows(enc.encode('bukan excel'))).rejects.toThrow('Bukan berkas Excel');
    expect(parseEsbSheet(await readXlsxRows(await xlsx([['Nama', 'Harga'], ['Kopi', 1]], { shared: false, deflate: true })))).toEqual({ kind: 'unknown' });
  });
});

const line = (name: string, qty: number, price: number, bills = qty): EsbMenuLine => ({ name, category: 'Minuman', sub: 'Coffee', qty, bills, amount: qty * price });

function check(bills: { ref: string; subtotal: number }[], lines: EsbMenuLine[]) {
  const a = allocateDay(bills, lines);
  for (const b of bills) expect(a.byBill[b.ref].reduce((n, l) => n + l.qty * l.unitPrice, 0)).toBe(b.subtotal);
  return a;
}

describe('allocateDay', () => {
  it('menyusun ulang isi transaksi sehingga total per transaksi dan per menu sama persis', () => {
    const lines = [line('Latte', 3, 26000), line('Kopi Susu', 4, 24000, 2), line('Americano', 1, 23000), line('Makanan', 1, 30000), line('Less Sugar', 1, 0)];
    const bills = [
      { ref: 'a', subtotal: 52000 },
      { ref: 'b', subtotal: 48000 },
      { ref: 'c', subtotal: 48000 },
      { ref: 'd', subtotal: 53000 },
      { ref: 'e', subtotal: 26000 },
    ];
    const a = check(bills, lines);
    expect(a.exact).toBe(true);
    expect(a.leftover).toEqual([]);
    expect(a.skippedFree).toEqual([{ name: 'Less Sugar', qty: 1 }]);
    const qty = (name: string) => Object.values(a.byBill).flat().filter((l) => l.name === name).reduce((n, l) => n + l.qty, 0);
    expect([qty('Latte'), qty('Kopi Susu'), qty('Americano'), qty('Makanan')]).toEqual([3, 4, 1, 1]);
    expect(Object.values(a.byBill).flat().every((l) => l.key === esbMenuKey({ name: l.name, sub: 'Coffee' }))).toBe(true);
  });

  it('memakai harga rata-rata dengan sisa rupiah di porsi terakhir', () => {
    const a = check([{ ref: 'a', subtotal: 50000 }], [{ name: 'Latte', category: '', sub: '', qty: 2, bills: 1, amount: 50000 }]);
    expect(a.exact).toBe(true);
    // Harga berbeda dalam satu hari (26.000 + 25.000) tidak bisa dipulihkan dari rata-rata: total transaksi tetap benar.
    const odd = check([{ ref: 'a', subtotal: 26000 }, { ref: 'b', subtotal: 25000 }], [{ name: 'Latte', category: '', sub: '', qty: 2, bills: 2, amount: 51000 }]);
    expect(odd.exact).toBe(false);
  });

  it('bila tidak ada pembagian persis, total transaksi tetap benar lewat baris "rincian tidak diketahui"', () => {
    const a = check([{ ref: 'a', subtotal: 30000 }, { ref: 'b', subtotal: 10000 }], [line('Latte', 1, 26000), line('Teh', 1, 18000)]);
    expect(a.exact).toBe(false);
    expect(a.byBill.a.map((l) => l.name)).toEqual(['Latte', ESB_UNKNOWN_LINE]);
    expect(a.byBill.b).toEqual([{ key: '', name: ESB_UNKNOWN_LINE, unitPrice: 10000, qty: 1 }]);
    expect(a.leftover).toEqual([{ name: 'Teh', qty: 1, amount: 18000 }]);
  });

  it('tanpa laporan menu: tiap transaksi satu baris rincian tidak diketahui', () => {
    const a = check([{ ref: 'a', subtotal: 23000 }], []);
    expect(a.exact).toBe(false);
    expect(a.byBill.a).toHaveLength(1);
  });
});

describe('pemetaan', () => {
  it('menebak menu Mourden dari nama (huruf besar/kecil, isi kurung, spasi)', () => {
    const products = [
      { id: '1', name: 'Latte' },
      { id: '2', name: 'Mourden Dirty Latte' },
      { id: '3', name: 'Es Kopi Susu' },
      { id: '4', name: 'Es Kopi Susu' },
    ];
    expect(suggestProduct('Latte (Ice/Hot)', products)?.id).toBe('1');
    expect(suggestProduct('mourden dirty latte ', products)?.id).toBe('2');
    expect(suggestProduct('Es Kopi Susu', products)).toBeNull(); // dua kandidat: biarkan owner memilih
    expect(suggestProduct('Matcha', products)).toBeNull();
    const priced = [{ id: 'a', name: 'Americano', price: 23000 }];
    expect(suggestProduct('Americano', priced, 23000)?.id).toBe('a');
    expect(suggestProduct('Americano', priced, 90000)).toBeNull(); // ukuran 1 liter: jangan ditebak
  });

  it('metode bayar ESB', () => {
    expect(esbPaymentMethod('Cash (POS)')).toBe('cash');
    expect(esbPaymentMethod('QRIS Mandiri')).toBe('qris');
    expect(esbPaymentMethod('EDC Mandiri (POS)')).toBe('card');
    expect(esbPaymentMethod('Transfer BCA')).toBe('card');
  });

  it('waktu lokal toko ke UTC', () => {
    expect(localToUtcIso('2026-11-01T12:01:05', 'Asia/Jakarta')).toBe('2026-11-01T05:01:05.000Z');
    expect(localToUtcIso('2026-11-01T00:30:00', 'Asia/Makassar')).toBe('2026-10-31T16:30:00.000Z');
  });
});
