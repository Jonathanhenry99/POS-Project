import { BellRing, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, ErrorNote, Field, TextInput, Toggle, cx } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { storeTimezone, useApi } from './hooks';

// Layanan pengirim: CallMeBot (gratis, untuk pemakaian pribadi). Tiap penerima mengaktifkan nomornya sendiri.
const BOT_NUMBER = '+34 644 31 95 65';
const BOT_PHRASE = 'I allow callmebot to send me messages';
const BOT_LINK = `https://wa.me/${BOT_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(BOT_PHRASE)}`;
const BOT_HELP = 'https://www.callmebot.com/blog/free-api-whatsapp-messages/';

type ToggleKey = 'lowStock' | 'soldOut' | 'dayClose';
interface Recipient {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}
interface LogRow {
  id: string;
  kind: 'stock' | 'sold-out' | 'day-close' | 'test';
  body: string;
  createdAt: string;
  sentAt: string | null;
  attempts: number;
  lastError: string;
  recipientName: string;
}
interface NotifyData {
  toggles: Record<ToggleKey, boolean>;
  recipients: Recipient[];
  log: LogRow[];
}

const KIND_LABEL: Record<LogRow['kind'], string> = { stock: 'Stok bahan', 'sold-out': 'Menu habis', 'day-close': 'Tutup toko', test: 'Tes kirim' };
const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
  { key: 'lowStock', label: 'Bahan menipis atau habis', description: 'Sekali saat stok turun ke batas minimum, sekali lagi saat habis. Tidak diulang sampai stok diisi lagi.' },
  { key: 'soldOut', label: 'Menu ditandai habis di kasir', description: 'Saat kasir menekan Menu habis di tablet.' },
  { key: 'dayClose', label: 'Ringkasan saat Tutup toko', description: 'Daftar bahan yang kurang dan menu yang masih ditandai habis, untuk belanja besok.' },
];

/** Kabar stok ke WhatsApp owner. Kunci layanan hanya dikirim ke server dan tidak pernah ditampilkan lagi. */
export function NotifyCard() {
  const { data, error, reload } = useApi<NotifyData>('/notify');
  const tz = storeTimezone();
  const [form, setForm] = useState({ name: '', phone: '', apikey: '' });
  const [busy, setBusy] = useState('');
  const ready = form.name.trim() && form.phone.trim().length >= 8 && form.apikey.trim().length >= 3;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const add = () =>
    run('add', async () => {
      await api('/notify/recipients', { method: 'POST', body: form });
      setForm({ name: '', phone: '', apikey: '' });
      toast('Penerima ditambahkan. Tekan Tes kirim untuk memastikan pesannya sampai.');
    });

  const test = (r: Recipient) =>
    run(`test-${r.id}`, async () => {
      const res = await api<{ ok: boolean; detail: string }>(`/notify/recipients/${r.id}/test`, { method: 'POST' });
      if (res.ok) toast(`Pesan tes dikirim ke ${r.name}. Cek WhatsApp dalam beberapa detik.`);
      else toast(`Gagal mengirim: ${res.detail}`, 'error');
    });

  const remove = async (r: Recipient) => {
    const ok = await confirmDialog({ title: `Hapus ${r.name}?`, message: `Nomor ${r.phone} tidak lagi menerima kabar dari POS.`, confirmLabel: 'Hapus', danger: true });
    if (ok) await run(`del-${r.id}`, () => api(`/notify/recipients/${r.id}`, { method: 'DELETE' }));
  };

  return (
    <Card title="Notifikasi WhatsApp" icon={<BellRing className="size-4" />}>
      <ErrorNote>{error}</ErrorNote>
      <p className="text-sm text-fg-muted">POS mengirim kabar ke WhatsApp Anda saat bahan menipis atau habis. Pesan dikirim dari server, jadi tablet kasir tidak perlu aplikasi atau nomor tambahan.</p>

      <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
        <p className="font-semibold">Aktifkan nomor (sekali saja, dari HP penerima)</p>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-fg-muted">
          <li>
            Kirim pesan <span className="font-semibold text-fg">{BOT_PHRASE}</span> ke nomor <span className="font-semibold text-fg tabular">{BOT_NUMBER}</span> lewat WhatsApp.
          </li>
          <li>Tunggu balasan berisi API key (biasanya kurang dari 2 menit).</li>
          <li>Isi nama, nomor WhatsApp dan API key di bawah, lalu tekan Tes kirim.</li>
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href={BOT_LINK} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold">
            <MessageCircle className="size-4" />
            Buka WhatsApp dengan pesan terisi
          </a>
          <a href={BOT_HELP} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
            Panduan resmi CallMeBot
          </a>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">Layanan gratis pihak ketiga: sesekali pesan bisa terlambat. Peringatan stok di dashboard tetap menjadi pegangan utama.</p>
      </div>

      {!!data?.recipients.length && (
        <ul className="mt-4 divide-y divide-line">
          {data.recipients.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-40">
                <p className={cx('font-semibold', !r.active && 'text-fg-subtle')}>
                  {r.name} {!r.active && <Badge>Dijeda</Badge>}
                </p>
                <p className="text-sm text-fg-muted tabular">{r.phone}</p>
              </div>
              <Button size="sm" variant="outline" icon={<Send className="size-4" />} loading={busy === `test-${r.id}`} onClick={() => void test(r)}>
                Tes kirim
              </Button>
              <Button size="sm" variant="ghost" loading={busy === `act-${r.id}`} onClick={() => void run(`act-${r.id}`, () => api(`/notify/recipients/${r.id}`, { method: 'PATCH', body: { active: !r.active } }))}>
                {r.active ? 'Jeda' : 'Aktifkan'}
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" aria-label={`Hapus ${r.name}`} icon={<Trash2 className="size-4" />} loading={busy === `del-${r.id}`} onClick={() => void remove(r)} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Nama penerima">{(id) => <TextInput id={id} value={form.name} maxLength={40} placeholder="Owner" onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Nomor WhatsApp">{(id) => <TextInput id={id} value={form.phone} inputMode="tel" placeholder="628123456789" onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
        <Field label="API key">{(id) => <TextInput id={id} value={form.apikey} autoComplete="off" placeholder="dari balasan bot" onChange={(e) => setForm({ ...form, apikey: e.target.value })} />}</Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">API key disimpan di server dan tidak ditampilkan lagi. Paling banyak 5 penerima; tiap nomor mengaktifkan sendiri.</p>
        <Button disabled={!ready} loading={busy === 'add'} onClick={() => void add()}>
          Tambah penerima
        </Button>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-1 text-sm font-semibold text-fg-muted">Kabar yang dikirim</p>
        {TOGGLES.map((t) => (
          <Toggle
            key={t.key}
            label={t.label}
            description={t.description}
            checked={data?.toggles[t.key] ?? true}
            onChange={(v) => void run(`toggle-${t.key}`, () => api('/notify/toggles', { method: 'PUT', body: { [t.key]: v } }))}
          />
        ))}
        <p className="mt-1 text-xs text-fg-subtle">Stok bahan baru turun otomatis per penjualan bila Resep & HPP menu sudah diisi. Tanpa resep, kabar bahan muncul setelah opname atau pencatatan waste.</p>
      </div>

      {!!data?.log.length && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-sm font-semibold text-fg-muted">Pesan terakhir</p>
          <ul className="flex flex-col gap-2">
            {data.log.slice(0, 5).map((m) => (
              <li key={m.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{KIND_LABEL[m.kind] ?? m.kind}</span>
                  <Badge tone={m.sentAt ? 'green' : m.lastError ? 'red' : 'amber'}>{m.sentAt ? 'Terkirim' : m.lastError ? 'Gagal' : 'Antre'}</Badge>
                  <span className="ml-auto text-xs text-fg-subtle">
                    {m.recipientName} · {formatDateTime(m.createdAt, tz)}
                  </span>
                </div>
                {!m.sentAt && m.lastError && <p className="mt-1 text-xs text-danger">{m.lastError}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
