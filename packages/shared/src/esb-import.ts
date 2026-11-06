// Impor penjualan dari ekspor Excel ESB (POS lama) supaya laporan, omset bonus tim dan analisa menu di Mourden
// lengkap sejak awal bulan. Fungsi murni: dipakai di browser (membaca berkas) dan di server (menyusun transaksi).
//
// ESB memberi dua laporan yang dipakai:
// - "Laporan Detail Penjualan": satu baris per transaksi (waktu, metode bayar, subtotal, service, pembulatan, total)
//   tetapi TANPA rincian menu per transaksi.
// - "Laporan Menu Per Periode" per hari: jumlah terjual & penjualan per menu.
// Rincian menu tiap transaksi disusun ulang dari laporan menu hari itu sehingga jumlah per transaksi persis sama
// dengan subtotal ESB dan total per menu per hari persis sama dengan laporan menu.

export type Cell = string | number | null;
export type SheetRows = Cell[][];

// ---------------------------------------------------------------------------------------------------------------
// Pembaca .xlsx minimal (zip + XML), tanpa library supaya bundle tablet/HP tetap ringan.

const textDecoder = new TextDecoder();

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Isi berkas di dalam zip (nama -> byte). Hanya metode simpan (0) dan deflate (8). */
async function unzip(buf: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Bukan berkas Excel (.xlsx)');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Berkas Excel rusak');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = textDecoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error('Format kompresi Excel tidak didukung');
  }
  return out;
}

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

/** Gabungan semua <t> di dalam potongan XML (teks biasa atau rich text). */
function textOf(xml: string): string {
  let s = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += m[1];
  return decodeXml(s);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Baca sheet pertama berkas .xlsx menjadi baris-baris sel (teks atau angka; tanggal tetap angka seri Excel). */
export async function readXlsxRows(data: Uint8Array): Promise<SheetRows> {
  const files = await unzip(data, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const text = (n: string) => (files.has(n) ? textDecoder.decode(files.get(n)) : '');
  // Sheet pertama sesuai workbook.xml, bukan sekadar sheet1.xml.
  let sheetPath = '';
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(text('xl/workbook.xml'))?.[1];
  if (rid) {
    const target = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(text('xl/_rels/workbook.xml.rels'))?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(text('xl/_rels/workbook.xml.rels'))?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  if (!files.has(sheetPath)) sheetPath = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort()[0] ?? '';
  if (!sheetPath) throw new Error('Sheet tidak ditemukan di berkas Excel');

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows: SheetRows = [];
  for (const rm of text(sheetPath).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNo = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
    const row: Cell[] = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? '';
      const ref = /\br="([A-Z]+\d*)"/.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : row.length;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (type === 's') value = v === undefined ? null : (shared[Number(v)] ?? null);
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'str' || type === 'e') value = v === undefined ? null : decodeXml(v);
      else if (type === 'b') value = v === '1' ? 1 : 0;
      else value = v === undefined || v === '' ? null : Number(v);
      row[idx] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[rowNo - 1] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// Mengenali & membaca laporan ESB.

export interface EsbTransaction {
  /** No Transaksi ESB (unik), dipakai supaya impor ulang tidak menggandakan. */
  ref: string;
  bill: string;
  /** Tanggal usaha (Sales In Date). */
  date: string;
  /** Waktu bayar lokal toko 'YYYY-MM-DDTHH:MM:SS' (Sales Out). */
  paidAt: string;
  orderType: 'dine_in' | 'take_away';
  table: string;
  method: string;
  salesType: string;
  subtotal: number;
  discount: number;
  service: number;
  tax: number;
  /** Biaya pengiriman + biaya pemesanan (Mourden belum punya kolomnya). */
  otherFees: number;
  rounding: number;
  total: number;
}

export interface EsbMenuLine {
  name: string;
  category: string;
  sub: string;
  qty: number;
  /** Jumlah transaksi yang memuat menu ini. */
  bills: number;
  amount: number;
}

export type EsbFile =
  | { kind: 'detail'; from: string; to: string; transactions: EsbTransaction[] }
  | { kind: 'menu'; from: string; to: string; lines: EsbMenuLine[] }
  | { kind: 'unknown' };

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6, JUL: 7, AGU: 8, AGS: 8, AUG: 8, SEP: 9, OKT: 10, OCT: 10, NOV: 11, NOP: 11, DES: 12, DEC: 12 };

const pad = (n: number) => String(n).padStart(2, '0');

/** Angka seri Excel (sistem 1900) -> 'YYYY-MM-DD'. */
function serialDate(n: number): string {
  return new Date(Math.round((n - 25569) * 86_400_000)).toISOString().slice(0, 10);
}

function cellDate(v: Cell): string | null {
  if (typeof v === 'number' && v > 20_000) return serialDate(Math.floor(v));
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

function cellTime(v: Cell): string | null {
  if (typeof v === 'number') {
    const secs = Math.round((v % 1) * 86_400);
    return `${pad(Math.floor(secs / 3600) % 24)}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
  }
  if (typeof v !== 'string') return null;
  const m = /(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/.exec(v);
  return m ? `${pad(Number(m[1]))}:${m[2]}:${m[3] ?? '00'}` : null;
}

function num(v: Cell): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string' || !v.trim()) return 0;
  // "Rp 25.000" / "25,000.00" / "25000"
  const s = v.replace(/[^\d,.-]/g, '');
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const money = (v: Cell) => Math.round(num(v));
const str = (v: Cell) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function headerIndex(rows: SheetRows, first: string): { at: number; col: (name: string) => number } | null {
  const at = rows.findIndex((r) => r.some((c) => typeof c === 'string' && norm(c) === norm(first)));
  if (at < 0) return null;
  const head = rows[at].map((c) => norm(str(c)));
  return { at, col: (name) => head.indexOf(norm(name)) };
}

function parsePeriod(rows: SheetRows): { from: string; to: string } | null {
  for (const r of rows.slice(0, 15)) {
    for (const c of r) {
      if (typeof c !== 'string') continue;
      // "PERIODE : 01 NOV 2026 - 01 NOV 2026"
      let m = /(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4})\s*-\s*(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4})/.exec(c);
      if (m && MONTHS[m[2].toUpperCase()] && MONTHS[m[5].toUpperCase()]) {
        return { from: `${m[3]}-${pad(MONTHS[m[2].toUpperCase()])}-${pad(Number(m[1]))}`, to: `${m[6]}-${pad(MONTHS[m[5].toUpperCase()])}-${pad(Number(m[4]))}` };
      }
      // "01-11-2026 - 05-11-2026"
      m = /(\d{2})-(\d{2})-(\d{4})\s*-\s*(\d{2})-(\d{2})-(\d{4})/.exec(c);
      if (m) return { from: `${m[3]}-${m[2]}-${m[1]}`, to: `${m[6]}-${m[5]}-${m[4]}` };
    }
  }
  return null;
}

/** Kenali laporan ESB dari isi sheet-nya (bukan nama berkas). */
export function parseEsbSheet(rows: SheetRows): EsbFile {
  const detail = headerIndex(rows, 'No Transaksi');
  if (detail && detail.col('Grand Total') >= 0) {
    const c = detail.col;
    const need = ['Sales In Date', 'Sales Out Date', 'Sales Out Time', 'Metode Pembayaran', 'Subtotal', 'Grand Total'];
    const missing = need.filter((n) => c(n) < 0);
    if (missing.length) throw new Error(`Kolom laporan detail ESB tidak lengkap: ${missing.join(', ')}`);
    const get = (r: Cell[], n: string) => (c(n) >= 0 ? (r[c(n)] ?? null) : null);
    const transactions: EsbTransaction[] = [];
    for (const r of rows.slice(detail.at + 1)) {
      const ref = str(get(r, 'No Transaksi'));
      const date = cellDate(get(r, 'Sales In Date'));
      if (!ref || !date) continue;
      const outDate = cellDate(get(r, 'Sales Out Date')) ?? date;
      const outTime = cellTime(get(r, 'Sales Out Time')) ?? cellTime(get(r, 'Sales In Time')) ?? '12:00:00';
      const mode = norm(str(get(r, 'Mode Penjualan')));
      const table = str(get(r, 'Table'));
      transactions.push({
        ref,
        bill: str(get(r, 'Bill Number')) || ref,
        date,
        paidAt: `${outDate}T${outTime}`,
        orderType: /take|bungkus|away|delivery|online/.test(mode) ? 'take_away' : 'dine_in',
        table: /quick service/i.test(table) ? '' : table,
        method: str(get(r, 'Metode Pembayaran')),
        salesType: str(get(r, 'Sales Type')) || 'Sales',
        subtotal: money(get(r, 'Subtotal')),
        discount: money(get(r, 'Diskon Menu')) + money(get(r, 'Diskon Nota')),
        service: money(get(r, 'Service Charge Total')),
        tax: money(get(r, 'Pajak Total')),
        otherFees: money(get(r, 'Biaya Pengiriman')) + money(get(r, 'Biaya Pemesanan')),
        rounding: money(get(r, 'Rounding Total')),
        total: money(get(r, 'Grand Total')),
      });
    }
    const dates = transactions.map((t) => t.date).sort();
    const period = parsePeriod(rows) ?? { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' };
    return { kind: 'detail', ...period, transactions };
  }

  const menu = headerIndex(rows, 'Menu');
  if (menu && menu.col('Jumlah Terjual') >= 0 && menu.col('Penjualan') >= 0) {
    const c = menu.col;
    const period = parsePeriod(rows);
    if (!period) throw new Error('Periode laporan menu ESB tidak terbaca');
    const lines: EsbMenuLine[] = [];
    for (const r of rows.slice(menu.at + 1)) {
      const name = str(r[c('Menu')] ?? null);
      const qty = Math.round(num(r[c('Jumlah Terjual')] ?? null));
      if (!name || qty <= 0) continue;
      lines.push({
        name,
        category: c('Kategori') >= 0 ? str(r[c('Kategori')] ?? null) : '',
        sub: c('Sub Kategori') >= 0 ? str(r[c('Sub Kategori')] ?? null) : '',
        qty,
        bills: c('Jumlah Transaksi') >= 0 ? Math.max(1, Math.round(num(r[c('Jumlah Transaksi')] ?? null))) : qty,
        amount: money(r[c('Penjualan')] ?? null),
      });
    }
    return { kind: 'menu', ...period, lines };
  }
  return { kind: 'unknown' };
}

// ---------------------------------------------------------------------------------------------------------------
// Pemetaan ke data Mourden.

/** Kunci menu ESB: nama + sub kategori (ESB bisa punya nama sama untuk ukuran berbeda, mis. "Americano" 1 Liter). */
export function esbMenuKey(line: Pick<EsbMenuLine, 'name' | 'sub'>): string {
  return `${norm(line.name)}|${norm(line.sub)}`;
}

export function esbPaymentMethod(method: string): 'cash' | 'qris' | 'card' {
  const m = norm(method);
  if (/cash|tunai/.test(m)) return 'cash';
  if (/qris|qr\b|gopay|ovo|dana|shopee/.test(m)) return 'qris';
  return 'card';
}

/** Nama untuk dicocokkan: tanpa isi kurung, tanda baca, dan huruf besar/kecil. */
export function matchKey(name: string): string {
  return norm(name.replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/gi, ' '));
}

/**
 * Tebakan menu Mourden untuk nama menu ESB: nama sama persis, lalu nama tanpa isi kurung/tanda baca.
 * Bila harga per porsi ESB diketahui, menu yang harganya jauh berbeda (mis. "Americano 1 Liter" Rp 90.000 vs
 * Americano Rp 23.000) tidak ditebak; owner memilih sendiri.
 */
export function suggestProduct<P extends { id: string; name: string; price?: number }>(name: string, products: P[], unitPrice?: number): P | null {
  if (unitPrice && unitPrice > 0) products = products.filter((p) => !p.price || (unitPrice >= p.price / 2 && unitPrice <= p.price * 2));
  const exact = products.filter((p) => norm(p.name) === norm(name));
  if (exact.length === 1) return exact[0];
  const loose = products.filter((p) => matchKey(p.name) === matchKey(name));
  return loose.length === 1 ? loose[0] : null;
}

/** Waktu lokal toko ('YYYY-MM-DDTHH:MM:SS') -> ISO UTC, tanpa library zona waktu. */
export function localToUtcIso(local: string, timeZone: string): string {
  const asUtc = Date.parse(`${local}Z`);
  const offsetAt = (ms: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value]),
    );
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`) - ms;
  };
  let ms = asUtc - offsetAt(asUtc);
  ms = asUtc - offsetAt(ms);
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------------------------------------------
// Menyusun ulang isi transaksi dari laporan menu harian.

export interface AllocatedLine {
  key: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface DayAllocation {
  /** ref transaksi -> baris menu. */
  byBill: Record<string, AllocatedLine[]>;
  /** true = semua transaksi & semua menu hari itu cocok persis. */
  exact: boolean;
  /** Menu Rp 0 (mis. tingkat gula) tidak ikut disusun; tidak memengaruhi uang. */
  skippedFree: { name: string; qty: number }[];
  /** Menu yang tidak masuk ke transaksi mana pun (hanya bila tidak cocok persis). */
  leftover: { name: string; qty: number; amount: number }[];
}

export const ESB_UNKNOWN_LINE = 'Penjualan ESB (rincian tidak diketahui)';

interface Unit {
  key: string;
  name: string;
  price: number;
}

/** Harga per porsi; bila rata-ratanya tidak bulat, sisa rupiahnya di porsi terakhir. */
function unitsOf(line: EsbMenuLine): Unit[] {
  const base = Math.floor(line.amount / line.qty);
  const units: Unit[] = [];
  for (let i = 0; i < line.qty; i++) units.push({ key: esbMenuKey(line), name: line.name, price: i === line.qty - 1 ? line.amount - base * (line.qty - 1) : base });
  return units;
}

/**
 * Bagi porsi menu hari itu ke transaksi sehingga jumlah tiap transaksi = subtotalnya.
 * Tahap 1 mencari pembagian per harga (pencarian mundur dengan memo, dibatasi langkahnya); tahap 2 membagikan menu
 * ke slot harga dengan memperhatikan "Jumlah Transaksi" ESB (menu yang dibeli 4 porsi di 2 transaksi -> 2 + 2).
 * Bila tidak ada pembagian persis, transaksi diisi sebisanya dan selisihnya menjadi satu baris "rincian tidak diketahui"
 * supaya total transaksi tetap benar.
 */
export function allocateDay(bills: { ref: string; subtotal: number }[], lines: EsbMenuLine[], maxSteps = 400_000): DayAllocation {
  const skippedFree = lines.filter((l) => l.amount <= 0).map((l) => ({ name: l.name, qty: l.qty }));
  const paid = lines.filter((l) => l.amount > 0);
  const units = paid.flatMap(unitsOf);
  const prices = [...new Set(units.map((u) => u.price))].sort((a, b) => b - a);
  const counts = prices.map((p) => units.filter((u) => u.price === p).length);
  const order = [...bills].sort((a, b) => b.subtotal - a.subtotal || a.ref.localeCompare(b.ref));
  const sumUnits = units.reduce((n, u) => n + u.price, 0);
  const sumBills = bills.reduce((n, b) => n + b.subtotal, 0);

  // Tahap 1: pembagian jumlah porsi per harga untuk tiap transaksi.
  let steps = 0;
  const failed = new Set<string>();
  const pick: number[][] = [];
  const left = [...counts];
  const solve = (bi: number): boolean => {
    if (bi === order.length) return left.every((n) => n === 0);
    const memo = `${bi}:${left.join(',')}`;
    if (failed.has(memo)) return false;
    const take = new Array<number>(prices.length).fill(0);
    const fill = (pi: number, rest: number): boolean => {
      if (++steps > maxSteps) return false;
      if (rest === 0) {
        pick[bi] = [...take];
        return solve(bi + 1);
      }
      if (pi === prices.length) return false;
      const max = Math.min(left[pi], Math.floor(rest / prices[pi]));
      for (let k = max; k >= 0; k--) {
        take[pi] = k;
        left[pi] -= k;
        const ok = fill(pi + 1, rest - k * prices[pi]);
        left[pi] += k;
        if (ok) return true;
        if (steps > maxSteps) break;
      }
      take[pi] = 0;
      return false;
    };
    if (fill(0, order[bi].subtotal)) return true;
    if (steps <= maxSteps) failed.add(memo);
    return false;
  };
  const exact = sumUnits === sumBills && bills.length > 0 && solve(0);

  if (!exact) return greedy(order, paid, skippedFree);

  // Tahap 2: menu mana mengisi slot harga di transaksi mana.
  const byBill: Record<string, AllocatedLine[]> = Object.fromEntries(order.map((b) => [b.ref, []]));
  prices.forEach((price, pi) => {
    const free = order.map((b, bi) => ({ ref: b.ref, n: pick[bi][pi] })).filter((s) => s.n > 0);
    const items = paid
      .map((l) => ({ line: l, units: unitsOf(l).filter((u) => u.price === price).length }))
      .filter((x) => x.units > 0)
      .sort((a, b) => b.units - a.units || a.line.name.localeCompare(b.line.name));
    for (const { line, units: total } of items) {
      let remaining = total;
      let spread = Math.max(1, Math.min(line.bills, total));
      while (remaining > 0) {
        // Transaksi dengan slot terbanyak dulu; potongan dibuat supaya menu tersebar ke `spread` transaksi.
        free.sort((a, b) => b.n - a.n || a.ref.localeCompare(b.ref));
        const slot = free.find((s) => s.n > 0)!;
        const chunk = Math.min(slot.n, Math.max(1, Math.ceil(remaining / spread)), remaining);
        const list = byBill[slot.ref];
        const same = list.find((x) => x.key === esbMenuKey(line) && x.unitPrice === price);
        if (same) same.qty += chunk;
        else list.push({ key: esbMenuKey(line), name: line.name, unitPrice: price, qty: chunk });
        slot.n -= chunk;
        remaining -= chunk;
        spread = Math.max(1, spread - 1);
      }
    }
  });
  return { byBill, exact: true, skippedFree, leftover: [] };
}

/** Cadangan bila tidak ada pembagian persis: isi transaksi terbesar dulu dengan porsi termahal yang masih muat. */
function greedy(order: { ref: string; subtotal: number }[], paid: EsbMenuLine[], skippedFree: DayAllocation['skippedFree']): DayAllocation {
  const pool = paid.flatMap(unitsOf).sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
  const used = new Array<boolean>(pool.length).fill(false);
  const byBill: Record<string, AllocatedLine[]> = {};
  for (const b of order) {
    let rest = b.subtotal;
    const list: AllocatedLine[] = [];
    pool.forEach((u, i) => {
      if (used[i] || u.price > rest) return;
      used[i] = true;
      rest -= u.price;
      const same = list.find((x) => x.key === u.key && x.unitPrice === u.price);
      if (same) same.qty += 1;
      else list.push({ key: u.key, name: u.name, unitPrice: u.price, qty: 1 });
    });
    if (rest > 0) list.push({ key: '', name: ESB_UNKNOWN_LINE, unitPrice: rest, qty: 1 });
    byBill[b.ref] = list;
  }
  const leftover = new Map<string, { name: string; qty: number; amount: number }>();
  pool.forEach((u, i) => {
    if (used[i]) return;
    const l = leftover.get(u.key) ?? { name: u.name, qty: 0, amount: 0 };
    l.qty += 1;
    l.amount += u.price;
    leftover.set(u.key, l);
  });
  return { byBill, exact: false, skippedFree, leftover: [...leftover.values()] };
}
