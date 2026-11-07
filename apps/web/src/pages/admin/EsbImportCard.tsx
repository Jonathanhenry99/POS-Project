import { Calculator, Check, CircleAlert, FileSpreadsheet, History, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { Link } from 'react-router';
import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../lib/state';
import { formatNumber, PAYMENT_LABEL, parseEsbSheet, readXlsxRows, type EsbFile, type EsbMenuLine, type EsbTransaction, type PaymentMethod } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { SearchSelect, type SelectOption } from '../../components/SearchSelect';
import { Badge, Button, Card, ErrorNote, Spinner, cx } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { dayLabel } from '../../lib/schedule';
import { useApi } from './hooks';

interface LoadedFile {
  name: string;
  file: EsbFile | null;
  error: string;
}

interface PreviewDay {
  date: string;
  bills: number;
  newBills: number;
  alreadyImported: number;
  subtotal: number;
  discount: number;
  service: number;
  total: number;
  methods: Partial<Record<PaymentMethod, { count: number; amount: number }>>;
  hasMenu: boolean;
  menuAmount: number;
  exact: boolean;
  leftover: { name: string; qty: number; amount: number }[];
  skippedFree: { name: string; qty: number }[];
  skipped: { ref: string; bill: string; reason: string }[];
  pos: { count: number; total: number };
}

interface PreviewMenu {
  key: string;
  name: string;
  category: string;
  sub: string;
  qty: number;
  amount: number;
  productId: string;
  source: 'saved' | 'name' | 'size' | null;
}

interface Preview {
  days: PreviewDay[];
  methods: { name: string; method: PaymentMethod }[];
  menus: PreviewMenu[];
  products: { id: string; name: string; category: string; price: number }[];
}

interface ImportResult {
  inserted: number;
  skipped: number;
  items: number;
  total: number;
  /** HPP perkiraan dari resep untuk tanggal-tanggal yang diimpor. */
  cogs: number;
  created: { name: string; category: string; price: number }[];
}

interface ImportedDay {
  date: string;
  count: number;
  total: number;
  /** Penjualan bersih (setelah diskon, tanpa service & pajak) = dasar laba kotor. */
  revenue: number;
  /** HPP perkiraan dari resep x harga bahan. */
  cogs: number;
}
interface ImportedData {
  days: ImportedDay[];
  /** Menu terjual dari ESB yang belum punya resep (HPP-nya dihitung 0). */
  missingRecipes: { name: string; qty: number; unmatched: boolean }[];
}

const rp = (n: number) => `Rp ${formatNumber(n)}`;
const NO_PRODUCT = '__none__';
/** Sama dengan NEW_PRODUCT di server: jadikan menu baru di POS. */
const NEW_PRODUCT = 'new';
const newCategory = (m: Pick<PreviewMenu, 'sub' | 'category'>) => m.sub || m.category || 'Lainnya';

/** Gabungan isi semua berkas: transaksi dari laporan detail, menu dari laporan menu satu hari. */
function collect(files: LoadedFile[]): { transactions: EsbTransaction[]; menuDays: { date: string; lines: EsbMenuLine[] }[]; multiDayMenus: string[] } {
  const transactions: EsbTransaction[] = [];
  const menuDays = new Map<string, EsbMenuLine[]>();
  const multiDayMenus: string[] = [];
  for (const f of files) {
    if (f.file?.kind === 'detail') transactions.push(...f.file.transactions);
    if (f.file?.kind === 'menu') {
      if (f.file.from === f.file.to) menuDays.set(f.file.from, f.file.lines);
      else multiDayMenus.push(f.name);
    }
  }
  return { transactions, menuDays: [...menuDays].map(([date, lines]) => ({ date, lines })), multiDayMenus };
}

function fileLabel(f: LoadedFile): string {
  if (!f.file) return f.error;
  if (f.file.kind === 'detail') return `Detail penjualan · ${f.file.transactions.length} transaksi · ${f.file.from === f.file.to ? dayLabel(f.file.from, 'short') : `${dayLabel(f.file.from, 'short')} – ${dayLabel(f.file.to, 'short')}`}`;
  if (f.file.kind === 'menu') return `Laporan menu · ${f.file.from === f.file.to ? dayLabel(f.file.from, 'short') : 'lebih dari 1 hari (tidak dipakai)'} · ${f.file.lines.length} menu`;
  return 'Bukan laporan ESB yang dikenali';
}

/**
 * Impor penjualan dari ESB: owner memilih berkas Excel dari ESB, memeriksa ringkasan per hari dan pemetaan menu,
 * lalu menyimpannya. Berkas dibaca di perangkat ini; hanya angka transaksinya yang dikirim ke server.
 */
export function EsbImportCard() {
  const tablet = useApp((st) => st.mode === 'tablet');
  if (tablet) return null;
  return <EsbImport />;
}

function EsbImport() {
  const imported = useApi<ImportedData>('/admin/import/esb');
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<ImportResult | null>(null);
  const [showMenus, setShowMenus] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const data = useMemo(() => collect(files), [files]);

  const runPreview = async (next: LoadedFile[]) => {
    const c = collect(next);
    setPreview(null);
    setPreviewError('');
    setDone(null);
    if (!c.transactions.length) return;
    setBusy('preview');
    try {
      const p = await api<Preview>('/admin/import/esb/preview', { method: 'POST', body: { transactions: c.transactions, menuDays: c.menuDays }, timeoutMs: 60_000 });
      setPreview(p);
      setMapping(Object.fromEntries(p.menus.map((m) => [m.key, m.productId])));
      // Bawaan: tanggal yang masih ada transaksi baru dan belum ada penjualan dari tablet (supaya omset tidak dobel).
      setDates(new Set(p.days.filter((d) => d.newBills > 0 && d.pos.count === 0).map((d) => d.date)));
      setShowMenus(p.menus.some((m) => !m.productId));
    } catch (e) {
      setPreviewError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const addFiles = async (list: FileList | File[]) => {
    const picked = [...list].filter((f) => /\.xlsx$/i.test(f.name));
    if (!picked.length) {
      toast('Pilih berkas Excel (.xlsx) dari ESB', 'error');
      return;
    }
    setReading(true);
    const loaded = await Promise.all(
      picked.map(async (f): Promise<LoadedFile> => {
        try {
          return { name: f.name, file: parseEsbSheet(await readXlsxRows(new Uint8Array(await f.arrayBuffer()))), error: '' };
        } catch (e) {
          return { name: f.name, file: null, error: e instanceof Error ? e.message : 'Berkas tidak bisa dibaca' };
        }
      }),
    );
    const next = [...files.filter((f) => !loaded.some((l) => l.name === f.name)), ...loaded];
    setFiles(next);
    setReading(false);
    await runPreview(next);
  };

  const removeFile = (name: string) => {
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    void runPreview(next);
  };

  const chosen = preview?.days.filter((d) => dates.has(d.date)) ?? [];
  const chosenBills = chosen.reduce((n, d) => n + d.newBills, 0);
  const chosenTotal = chosen.reduce((n, d) => n + (d.bills ? Math.round((d.total * d.newBills) / d.bills) : 0), 0);
  const unmapped = preview?.menus.filter((m) => !mapping[m.key]).length ?? 0;
  const newMenus = preview?.menus.filter((m) => mapping[m.key] === NEW_PRODUCT) ?? [];

  const productOptions: SelectOption[] = useMemo(
    () => [
      { value: NO_PRODUCT, label: 'Simpan dengan nama ESB saja', hint: 'tanpa menu Mourden' },
      ...(preview?.products ?? []).map((p) => ({ value: p.id, label: p.name, hint: rp(p.price), group: p.category })),
    ],
    [preview],
  );

  const runImport = async () => {
    if (!preview) return;
    const ok = await confirmDialog({
      title: `Impor ${formatNumber(chosenBills)} transaksi ESB?`,
      message: `${chosen.map((d) => dayLabel(d.date, 'short')).join(', ')}. Masuk ke laporan, omset bonus tim dan riwayat transaksi dengan tanda ESB. Bisa dihapus lagi per tanggal.`,
      confirmLabel: 'Impor sekarang',
    });
    if (!ok) return;
    setBusy('import');
    try {
      const res = await api<ImportResult>('/admin/import/esb', {
        method: 'POST',
        body: { transactions: data.transactions, menuDays: data.menuDays, mapping, dates: [...dates] },
        timeoutMs: 120_000,
      });
      setDone(res);
      imported.reload();
      toast(`${formatNumber(res.inserted)} transaksi ESB diimpor`);
      await runPreview(files);
      setDone(res);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const recost = async () => {
    const days = imported.data?.days ?? [];
    if (!days.length) return;
    setBusy('recost');
    try {
      const dates = days.map((d) => d.date).sort();
      const r = await api<{ cogs: number }>('/admin/import/esb/recost', { method: 'POST', body: { from: dates[0], to: dates[dates.length - 1] } });
      imported.reload();
      toast(`HPP dihitung ulang dari resep: ${rp(r.cogs)}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const removeDay = async (d: ImportedDay) => {
    const ok = await confirmDialog({
      title: `Hapus impor ESB ${dayLabel(d.date)}?`,
      message: `${formatNumber(d.count)} transaksi (${rp(d.total)}) hasil impor dihapus. Penjualan dari tablet tidak tersentuh. Bisa diimpor ulang dari berkas yang sama.`,
      confirmLabel: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setBusy(`del:${d.date}`);
    try {
      await api('/admin/import/esb/delete', { method: 'POST', body: { from: d.date, to: d.date } });
      imported.reload();
      if (files.length) await runPreview(files);
      toast('Data impor dihapus');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Impor penjualan dari ESB" icon={<FileSpreadsheet className="size-4" />}>
        <p className="text-sm text-fg-muted">
          Pindahkan penjualan dari ESB supaya laporan, analisa menu dan omset bonus tim lengkap. Pilih <b className="text-fg">Laporan Detail Penjualan</b> dan{' '}
          <b className="text-fg">Laporan Menu Per Periode</b> (satu berkas per hari) sekaligus.
        </p>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={cx(
            'press mt-4 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-7 text-center transition-colors',
            drag ? 'border-primary bg-primary/8' : 'border-line-strong bg-surface-2 hover:border-primary/60',
          )}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">{reading ? <Spinner /> : <Upload className="size-6" />}</span>
          <span className="font-semibold">{files.length ? 'Tambah berkas lain' : 'Pilih berkas Excel dari ESB'}</span>
          <span className="text-xs text-fg-muted">Bisa pilih banyak berkas sekaligus · .xlsx · dibaca di perangkat ini</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {!!files.length && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {[...files]
              .sort((a, b) => (a.file?.kind === 'detail' ? -1 : 0) - (b.file?.kind === 'detail' ? -1 : 0) || a.name.localeCompare(b.name))
              .map((f, i) => (
                <li key={f.name} className="animate-rise flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2 text-sm" style={{ animationDelay: `${i * 30}ms` }}>
                  <span className={cx('grid size-8 shrink-0 place-items-center rounded-xl', f.file && f.file.kind !== 'unknown' ? 'bg-success/12 text-success' : 'bg-danger/10 text-danger')}>
                    {f.file && f.file.kind !== 'unknown' ? <Check className="size-4" /> : <CircleAlert className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{fileLabel(f)}</span>
                    <span className="block truncate text-xs text-fg-subtle">{f.name}</span>
                  </span>
                  <button aria-label={`Lepas ${f.name}`} className="press grid size-9 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-surface-3" onClick={() => removeFile(f.name)}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        {files.length > 0 && !data.transactions.length && (
          <p className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">Tambahkan juga Laporan Detail Penjualan; berkas itu berisi daftar transaksinya.</p>
        )}
        {data.multiDayMenus.length > 0 && (
          <p className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
            Laporan menu yang mencakup lebih dari satu hari tidak dipakai. Unduh laporan menu dari ESB per hari supaya rincian menu tiap transaksi bisa disusun.
          </p>
        )}
        <ErrorNote>{previewError}</ErrorNote>
        {busy === 'preview' && (
          <p className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
            <Spinner /> Memeriksa data...
          </p>
        )}
      </Card>

      {preview && (
        <>
          <Card title="Periksa per hari" icon={<Sparkles className="size-4" />}>
            <p className="mb-3 text-sm text-fg-muted">Centang tanggal yang mau diimpor. Rincian menu tiap transaksi disusun dari laporan menu hari itu: total per transaksi dan per menu sama persis dengan ESB.</p>
            <ul className="flex flex-col gap-2">
              {preview.days.map((d, i) => {
                const on = dates.has(d.date);
                const disabled = d.newBills === 0;
                return (
                  <li key={d.date} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() =>
                        setDates((s) => {
                          const n = new Set(s);
                          if (n.has(d.date)) n.delete(d.date);
                          else n.add(d.date);
                          return n;
                        })
                      }
                      className={cx(
                        'press flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                        on ? 'border-primary/50 bg-primary/6' : 'border-line bg-surface',
                        disabled && 'cursor-default opacity-60',
                      )}
                    >
                      <span className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors', on ? 'border-primary bg-primary text-white' : 'border-line-strong')}>
                        {on && <Check className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-bold capitalize">{dayLabel(d.date)}</span>
                          <span className="font-extrabold tabular">{rp(d.total)}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-fg-muted">
                          {formatNumber(d.bills)} transaksi · penjualan {rp(d.subtotal - d.discount)}
                          {d.service > 0 && ` · service ${rp(d.service)}`}
                          {' · '}
                          {Object.entries(d.methods)
                            .map(([m, v]) => `${PAYMENT_LABEL[m as PaymentMethod]} ${v!.count}`)
                            .join(', ')}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {d.alreadyImported > 0 && <Badge tone="stone">{d.newBills ? `${d.alreadyImported} sudah diimpor` : 'Sudah diimpor semua'}</Badge>}
                          {d.exact ? (
                            <Badge tone="green">Rincian menu cocok</Badge>
                          ) : d.hasMenu ? (
                            <Badge tone="amber">Rincian menu sebagian</Badge>
                          ) : (
                            <Badge tone="amber">Tanpa laporan menu</Badge>
                          )}
                          {d.pos.count > 0 && (
                            <Badge tone="red">
                              Sudah ada {d.pos.count} transaksi tablet ({rp(d.pos.total)})
                            </Badge>
                          )}
                          {d.skipped.length > 0 && <Badge tone="amber">{d.skipped.length} dilewati</Badge>}
                        </span>
                        {!d.hasMenu && <span className="mt-1.5 block text-xs text-fg-muted">Tambahkan Laporan Menu tanggal ini supaya menu terlaris terisi. Tanpa itu tiap transaksi dicatat sebagai satu baris "rincian tidak diketahui".</span>}
                        {d.hasMenu && d.menuAmount !== d.subtotal && (
                          <span className="mt-1.5 block text-xs text-fg-muted">
                            Penjualan di laporan menu ({rp(d.menuAmount)}) berbeda dengan laporan detail ({rp(d.subtotal)}); selisihnya dicatat sebagai "rincian tidak diketahui".
                          </span>
                        )}
                        {d.pos.count > 0 && <span className="mt-1.5 block text-xs text-danger">Hati-hati: bila transaksi tablet ini salinan dari ESB, mengimpor tanggal ini membuat omsetnya dobel.</span>}
                        {d.skipped.map((s) => (
                          <span key={s.ref} className="mt-1 block text-xs text-fg-muted">
                            {s.bill}: {s.reason}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card
            title="Cocokkan menu"
            icon={<FileSpreadsheet className="size-4" />}
            action={
              <Button size="sm" variant="ghost" onClick={() => setShowMenus((v) => !v)}>
                {showMenus ? 'Sembunyikan' : 'Tampilkan'}
              </Button>
            }
          >
            <p className="text-sm text-fg-muted">
              {preview.menus.length} menu ESB.{' '}
              {unmapped ? (
                <span className="font-semibold text-fg">{unmapped} belum dicocokkan, tetap tersimpan dengan nama ESB.</span>
              ) : (
                <span className="font-semibold text-success">Semua sudah dicocokkan.</span>
              )}{' '}
              Pilihan diingat untuk impor berikutnya.
            </p>
            {showMenus && (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {preview.menus.map((m) => (
                  <li key={m.key} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {m.name}
                        {m.sub && <span className="font-normal text-fg-muted"> · {m.sub}</span>}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {formatNumber(m.qty)} terjual · {rp(m.amount)}
                        {mapping[m.key] && mapping[m.key] === m.productId && m.source === 'name' && ' · dicocokkan otomatis'}
                        {mapping[m.key] === m.productId && m.source === 'saved' && ' · pilihan sebelumnya'}
                        {mapping[m.key] === NEW_PRODUCT && m.source === 'size' && ' · ukuran berbeda, disarankan menu baru'}
                      </span>
                    </span>
                    <SearchSelect
                      className="sm:max-w-72 sm:shrink-0"
                      label={`Menu Mourden untuk ${m.name}`}
                      value={mapping[m.key] || NO_PRODUCT}
                      onChange={(v) => setMapping((s) => ({ ...s, [m.key]: v === NO_PRODUCT ? '' : v }))}
                      options={[
                        { value: NEW_PRODUCT, label: '+ Jadikan menu baru di POS', hint: `kategori ${newCategory(m)} · ${rp(Math.round(m.amount / m.qty))}` },
                        ...productOptions,
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section className="animate-rise rounded-3xl p-5 text-white shadow-card" style={{ background: 'var(--ink)' }}>
            <p className="text-sm text-white/70">Siap diimpor</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight tabular">
              {formatNumber(chosenBills)} transaksi · {rp(chosenTotal)}
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-white/75">
              <li>Tercatat sebagai kasir "Impor ESB" dengan tanda ESB, di luar shift & tutup kasir tablet.</li>
              <li>Stok bahan tidak dipotong (bahannya sudah terpakai sebelum Mourden dipakai).</li>
              <li>
                Metode bayar: {preview.methods.map((m) => `${m.name} → ${PAYMENT_LABEL[m.method]}`).join('; ')}.
              </li>
              {preview.days.some((d) => d.skippedFree.length) && <li>Pilihan Rp 0 (mis. tingkat gula) tidak ikut dicatat.</li>}
              {newMenus.length > 0 && (
                <li className="font-semibold text-white">
                  Menu baru ditambahkan ke POS: {newMenus.map((m) => `${m.name} (${newCategory(m)}, ${rp(Math.round(m.amount / m.qty))})`).join('; ')}.
                </li>
              )}
            </ul>
            <Button className="mt-4 w-full sm:w-auto" size="lg" variant="success" loading={busy === 'import'} disabled={!chosenBills || !!busy} onClick={() => void runImport()}>
              Impor {formatNumber(chosenBills)} transaksi
            </Button>
            {done && (
              <p className="animate-rise mt-3 rounded-2xl bg-white/10 p-3 text-sm">
                Selesai: {formatNumber(done.inserted)} transaksi ({formatNumber(done.items)} item, {rp(done.total)}) masuk, HPP dari resep {rp(done.cogs)}.
                {done.skipped > 0 && ` ${formatNumber(done.skipped)} sudah ada sebelumnya, dilewati.`}
                {done.created.length > 0 && ` Menu baru di POS: ${done.created.map((c) => `${c.name} (${c.category})`).join(', ')}; lengkapi resepnya di Resep & HPP.`} Lihat di Laporan atau Transaksi.
              </p>
            )}
          </section>
        </>
      )}

      <Card
        title="Data hasil impor ESB"
        icon={<History className="size-4" />}
        action={
          imported.data?.days.length ? (
            <Button size="sm" variant="outline" icon={<Calculator className="size-4" />} loading={busy === 'recost'} disabled={!!busy} onClick={() => void recost()}>
              Hitung ulang HPP
            </Button>
          ) : undefined
        }
      >
        <ErrorNote>{imported.error}</ErrorNote>
        {!imported.data ? (
          <Spinner />
        ) : !imported.data.days.length ? (
          <p className="text-sm text-fg-muted">Belum ada penjualan yang diimpor.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-fg-muted">
              HPP dihitung dari resep menu yang dicocokkan x harga bahan (stok tidak dipotong), lalu ikut mengurangi laba kotor di Laporan. Setelah resep atau harga bahan diubah, tekan Hitung ulang HPP.
            </p>
            {imported.data.missingRecipes.length > 0 && (
              <div className="mb-3 rounded-2xl border border-warning/40 bg-warning/8 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-[#8a5a00]">
                  <CircleAlert className="size-4 shrink-0" /> {imported.data.missingRecipes.length} menu belum punya resep, HPP-nya masih Rp 0
                </p>
                <p className="mt-1 text-fg-muted">
                  {imported.data.missingRecipes
                    .slice(0, 12)
                    .map((m) => `${m.name} (${formatNumber(m.qty)}${m.unmatched ? ', belum dicocokkan' : ''})`)
                    .join(', ')}
                  {imported.data.missingRecipes.length > 12 && `, dan ${imported.data.missingRecipes.length - 12} lainnya`}.{' '}
                  <Link to="/admin/resep" className="font-semibold text-primary">
                    Lengkapi di Resep & HPP →
                  </Link>
                </p>
              </div>
            )}
            <ul className="flex flex-col divide-y divide-line">
              {imported.data.days.map((d) => {
                const profit = d.revenue - d.cogs;
                return (
                  <li key={d.date} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold capitalize">{dayLabel(d.date)}</span>
                      <span className="block text-sm text-fg-muted tabular">
                        {formatNumber(d.count)} transaksi · {rp(d.total)}
                      </span>
                      <span className="block text-sm text-fg-muted tabular">
                        HPP {rp(d.cogs)} · laba kotor <b className="text-fg">{rp(profit)}</b>
                        {d.revenue > 0 && ` (${Math.round((profit / d.revenue) * 1000) / 10}%)`}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10!" icon={<Trash2 className="size-4" />} loading={busy === `del:${d.date}`} disabled={!!busy} onClick={() => void removeDay(d)}>
                      Hapus
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
