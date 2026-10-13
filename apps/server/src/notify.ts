// Notifikasi WhatsApp ke owner: bahan menipis/habis, menu ditandai habis, dan ringkasan saat toko ditutup.
// Pesan masuk antrean di database dulu, baru dikirim; pesan yang gagal dicoba lagi pada kejadian berikutnya.
import { config } from './config';
import { pool, type Db } from './db';
import { getSettings } from './repo';

export interface NotifyToggles {
  soldOut: boolean;
  lowStock: boolean;
  dayClose: boolean;
  approval: boolean;
  attendance: boolean;
}
export const DEFAULT_TOGGLES: NotifyToggles = { soldOut: true, lowStock: true, dayClose: true, approval: true, attendance: true };
export type NotifyKind = 'sold-out' | 'stock' | 'day-close' | 'approval' | 'attendance' | 'test';

export interface SendResult {
  ok: boolean;
  detail: string;
}
export type Transport = (to: { phone: string; apikey: string }, text: string) => Promise<SendResult>;

/** CallMeBot: GET dengan nomor, teks dan kunci. Jawaban 200 = pesan diterima antreannya; kunci salah dijawab 203. */
const callMeBot: Transport = async (to, text) => {
  const url = `${config.whatsappApiUrl}?phone=${encodeURIComponent(to.phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(to.apikey)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.status === 200) return { ok: true, detail: '' };
    const html = await r.text();
    // Jawaban gagal mengulang nomor & teks, lalu alasannya dalam paragraf merah. Ambil alasannya saja.
    const reason = (/color:\s*red[^>]*>([\s\S]*)$/i.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { ok: false, detail: (reason || `Layanan menjawab ${r.status}`).slice(0, 200) };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { ok: false, detail: timeout ? 'Layanan WhatsApp tidak menjawab' : 'Tidak bisa menghubungi layanan WhatsApp' };
  }
};

let transport: Transport = callMeBot;
/** Dipakai tes untuk mengganti pengirim. */
export function setTransport(t: Transport | null) {
  transport = t ?? callMeBot;
}
export const sendNow: Transport = (to, text) => transport(to, text);

/** Nomor Indonesia boleh ditulis 0812…, 62812… atau +62812…; disimpan sebagai +62812…. */
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  else if (p.startsWith('0')) p = `+62${p.slice(1)}`;
  else if (!p.startsWith('+')) p = `+${p}`;
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

export async function getToggles(db: Db = pool): Promise<NotifyToggles> {
  const { rows } = await db.query<{ value: Partial<NotifyToggles> }>("select value from settings where key = 'notify'");
  return { ...DEFAULT_TOGGLES, ...rows[0]?.value };
}

const pending = new Set<Promise<unknown>>();
/** Menunggu semua pengiriman latar selesai (tes & penutupan server). */
export async function drainNotifications() {
  while (pending.size) await Promise.allSettled([...pending]);
}

type RequestContext = { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined };

/**
 * Jalankan pekerjaan tanpa menahan jawaban ke tablet. Di Vercel fungsi bisa dibekukan begitu jawaban terkirim,
 * jadi pekerjaan dititipkan ke waitUntil; bila tidak tersedia, ditunggu sampai selesai.
 */
async function background(work: Promise<unknown>) {
  const safe = work.catch((e) => console.error('[notify]', e));
  pending.add(safe);
  void safe.finally(() => pending.delete(safe));
  const ctx = (globalThis as unknown as Record<symbol, RequestContext | undefined>)[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(safe);
  else if (process.env.VERCEL) await safe;
}

/** Kirim pesan yang masih antre. Baris diklaim dulu supaya dua instance server tidak mengirim pesan yang sama. */
export async function flushOutbox() {
  const { rows } = await pool.query<{ id: string; body: string; phone: string; apikey: string }>(
    `update notify_outbox o set attempts = o.attempts + 1, claimed_at = now()
     from notify_recipients r
     where r.id = o.recipient_id and o.id in (
       select o2.id from notify_outbox o2 join notify_recipients r2 on r2.id = o2.recipient_id
       where o2.sent_at is null and r2.active and o2.attempts < 5 and o2.created_at > now() - interval '12 hours'
         and (o2.claimed_at is null or o2.claimed_at < now() - interval '1 minute')
       order by o2.created_at limit 10 for update of o2 skip locked
     )
     returning o.id, o.body, r.phone, r.apikey`,
  );
  await Promise.all(
    rows.map(async (m) => {
      const r = await transport({ phone: m.phone, apikey: m.apikey }, m.body);
      await pool.query('update notify_outbox set sent_at = $2, last_error = $3, claimed_at = null where id = $1', [m.id, r.ok ? new Date() : null, r.ok ? '' : r.detail]);
    }),
  );
}

/** Masukkan pesan ke antrean untuk semua penerima aktif, lalu kirim di latar. Tidak pernah menggagalkan permintaan pemanggil. */
async function notify(kind: Exclude<NotifyKind, 'test'>, toggle: keyof NotifyToggles, build: () => Promise<string | null>) {
  try {
    const { rows: recipients } = await pool.query<{ id: string }>('select id from notify_recipients where active');
    if (!recipients.length || !(await getToggles())[toggle]) return;
    const body = await build();
    if (!body) return;
    await pool.query('insert into notify_outbox (recipient_id, kind, body) select unnest($1::uuid[]), $2, $3', [recipients.map((r) => r.id), kind, body]);
    await background(flushOutbox());
  } catch (e) {
    console.error('[notify]', e);
  }
}

/** Untuk modul lain (absensi): kirim satu kabar ke semua penerima aktif bila jenisnya dinyalakan. */
export const noticeToOwners = notify;

const qty = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const LIST_MAX = 12;

function clock(tz: string, at = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}

function bullets(lines: string[]): string {
  const shown = lines.slice(0, LIST_MAX).map((l) => `- ${l}`);
  if (lines.length > LIST_MAX) shown.push(`- dan ${lines.length - LIST_MAX} lainnya`);
  return shown.join('\n');
}

interface LevelRow {
  name: string;
  unit: string;
  minStock: number;
  stock: number;
  level: number;
}
const emptyLine = (r: LevelRow) => `${r.name} (sisa ${qty.format(r.stock)} ${r.unit})`;
const lowLine = (r: LevelRow) => `${r.name}: sisa ${qty.format(r.stock)} ${r.unit}, minimum ${qty.format(r.minStock)}`;

const LEVEL_SQL = `case when coalesce(sum(m.qty), 0) <= 0 then 2 when i.min_stock > 0 and coalesce(sum(m.qty), 0) <= i.min_stock then 1 else 0 end`;

/**
 * Samakan tingkat peringatan tiap bahan dengan stok terkini dan kembalikan bahan yang tingkatnya NAIK
 * (aman -> menipis, atau menipis -> habis). Karena tingkat tersimpan, satu bahan hanya dikabarkan sekali
 * sampai stoknya kembali di atas minimum, walaupun permintaan yang sama dikirim ulang oleh tablet.
 */
async function syncLevels(): Promise<LevelRow[]> {
  const { rows } = await pool.query<LevelRow & { before: number }>(
    `with lv as (
       select i.id, coalesce(sum(m.qty), 0)::float8 as stock, ${LEVEL_SQL} as level
       from ingredients i left join stock_movements m on m.ingredient_id = i.id
       where i.active group by i.id
     ), old as (select id, alert_level from ingredients)
     update ingredients i set alert_level = lv.level
     from lv join old on old.id = lv.id
     where i.id = lv.id and i.alert_level <> lv.level
     returning i.name, i.unit, i.min_stock::float8 as "minStock", lv.stock, lv.level, old.alert_level as before`,
  );
  return rows.filter((r) => r.level > r.before).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Dipanggil setelah stok berubah (penjualan, void, barang masuk, waste, opname).
 * `silent` hanya menyamakan tingkat tanpa mengirim pesan (bahan baru atau batas minimum diubah owner sendiri).
 */
export async function stockChanged(opts: { silent?: boolean } = {}) {
  try {
    const worse = await syncLevels();
    if (opts.silent || !worse.length) return;
    await notify('stock', 'lowStock', async () => {
      const s = await getSettings(pool);
      const empty = worse.filter((r) => r.level === 2);
      const low = worse.filter((r) => r.level === 1);
      const parts = [`*Stok bahan - ${s.store.name}*`];
      if (empty.length) parts.push(`HABIS:\n${bullets(empty.map(emptyLine))}`);
      if (low.length) parts.push(`Di bawah minimum:\n${bullets(low.map(lowLine))}`);
      parts.push(clock(s.store.timezone));
      return parts.join('\n\n');
    });
  } catch (e) {
    console.error('[notify]', e);
  }
}

export async function menuSoldOut(productName: string, byName: string) {
  await notify('sold-out', 'soldOut', async () => {
    const s = await getSettings(pool);
    return `*Menu habis - ${s.store.name}*\n${productName}\n\nDitandai oleh ${byName}, ${clock(s.store.timezone)}`;
  });
}

/** Kasir meminta persetujuan owner dari tablet. Kode di pesan ini bisa langsung dibacakan ke kasir bila setuju. */
export async function approvalRequested(r: { by: string; device: string; reason: string; code: string; minutes: number }) {
  await notify('approval', 'approval', async () => {
    const s = await getSettings(pool);
    return `*Minta persetujuan - ${s.store.name}*\n${r.by} (${r.device}):\n${r.reason}\n\nSetuju? Beri kode *${r.code.slice(0, 3)} ${r.code.slice(3)}* ke kasir, atau tekan Setujui di dashboard. Berlaku ${r.minutes} menit. Abaikan pesan ini untuk menolak.`;
  });
}

export async function dayClosed(day: { businessDate: string; closedByName: string }, deviceName: string) {
  await notify('day-close', 'dayClose', async () => {
    const s = await getSettings(pool);
    const [{ rows: stock }, { rows: menus }] = await Promise.all([
      pool.query<LevelRow>(
        `select * from (
           select i.name, i.unit, i.min_stock::float8 as "minStock", coalesce(sum(m.qty), 0)::float8 as stock, ${LEVEL_SQL} as level
           from ingredients i left join stock_movements m on m.ingredient_id = i.id
           where i.active group by i.id
         ) x where level > 0 order by name`,
      ),
      pool.query<{ name: string }>('select name from products where active and sold_out order by name'),
    ]);
    const empty = stock.filter((r) => r.level === 2);
    const low = stock.filter((r) => r.level === 1);
    const date = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day.businessDate}T00:00:00Z`));
    const parts = [`*Toko ditutup - ${s.store.name}*\n${date}, ditutup ${day.closedByName || 'kasir'} (${deviceName})`];
    if (empty.length) parts.push(`Bahan habis (${empty.length}):\n${bullets(empty.map(emptyLine))}`);
    if (low.length) parts.push(`Di bawah minimum (${low.length}):\n${bullets(low.map(lowLine))}`);
    if (!empty.length && !low.length) parts.push('Semua bahan di atas batas minimum.');
    if (menus.length) parts.push(`Menu masih ditandai habis (${menus.length}):\n${bullets(menus.map((m) => m.name))}`);
    return parts.join('\n\n');
  });
}
