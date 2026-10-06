import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  LogOut,
  PackageMinus,
  PackagePlus,
  Search,
  Sparkles,
  StickyNote,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { can, defaultStation, formatNumber, formatRupiah, formatTime, ROLE_LABEL, STATION_LABEL, type StockLevel, type Station } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Empty, ErrorNote, Field, Modal, MoneyInput, Skeleton, TextInput, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { uuid } from '../../lib/id';
import { logout } from '../../lib/session';
import { BrandLogo } from '../../components/BrandLogo';
import { useApp } from '../../lib/state';
import { TabletSidebar } from '../../components/TabletSidebar';

interface Sheet {
  station: Station;
  businessDate: string;
  items: StockLevel[];
  doneToday: { id: string; userName: string; createdAt: string } | null;
}

interface OpnameResult {
  opname: { id: string; userName: string; createdAt: string };
  items: { ingredientId: string; name: string; unit: string; systemQty: number; countedQty: number; diff: number; diffValue: number }[];
}

type Mode = 'opname' | 'purchase' | 'waste';

const STATIONS: Station[] = ['bar', 'kitchen', 'umum'];
const STATION_HUE: Record<Station, string> = { bar: '#2f5bea', kitchen: '#ff7a1a', umum: '#0e9f8f' };

function initials(name: string) {
  const w = name.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? w[0]?.[1] ?? '')).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

export function StockPage() {
  const user = useApp((s) => s.user)!;
  const appMode = useApp((s) => s.mode);
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('opname');
  const canSell = appMode === 'tablet' && can(user.role, 'pos.sell');

  return (
    <div className="flex h-full">
      {appMode === 'tablet' && <TabletSidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="bg-grad-header sticky top-0 z-20 text-white">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-3">
            {(canSell || can(user.role, 'admin')) && (
              <Link to={canSell ? '/kasir' : '/admin'} className="press grid size-11 place-items-center rounded-xl hover:bg-white/12" aria-label="Kembali">
                <ArrowLeft className="size-5" />
              </Link>
            )}
            {appMode !== 'tablet' && <BrandLogo className="h-10 w-12" />}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[17px] font-extrabold tracking-tight">Stok</p>
              <p className="truncate text-xs text-white/75">
                {user.name} · {ROLE_LABEL[user.role]}
              </p>
            </div>
            <button
              aria-label="Keluar"
              className="press grid size-11 place-items-center rounded-xl bg-white/12 hover:bg-white/20"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            <ModeTile active={mode === 'opname'} onClick={() => setMode('opname')} icon={<ClipboardCheck className="size-6" />} label="Stock opname" hint="Hitung stok" />
            <ModeTile active={mode === 'purchase'} onClick={() => setMode('purchase')} icon={<PackagePlus className="size-6" />} label="Barang masuk" hint="Belanja / kiriman" />
            <ModeTile active={mode === 'waste'} onClick={() => setMode('waste')} icon={<PackageMinus className="size-6" />} label="Terbuang" hint="Rusak / basi" tone="danger" />
          </div>
          {mode === 'opname' ? <Opname /> : <RecordMovement key={mode} type={mode} />}
        </div>
      </div>
    </div>
  );
}

function ModeTile({ active, onClick, icon, label, hint, tone }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; hint: string; tone?: 'danger' }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'press flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center',
        active
          ? tone === 'danger'
            ? 'border-danger bg-danger/8 text-danger'
            : 'border-primary bg-primary/8 text-primary shadow-[0_10px_24px_-16px_var(--primary)]'
          : 'border-line bg-surface text-fg-muted hover:border-line-strong',
      )}
    >
      {icon}
      <span className="text-sm leading-tight font-bold">{label}</span>
      <span className="text-[11px] leading-tight opacity-75">{hint}</span>
    </button>
  );
}

// ---------------------------------------------------------------- Opname

function useStoreTz() {
  return useApp((s) => s.data?.settings.store.timezone) ?? 'Asia/Jakarta';
}

function Opname() {
  const user = useApp((s) => s.user)!;
  const tz = useStoreTz();
  const isOwner = can(user.role, 'admin');
  const [station, setStation] = useState<Station>(defaultStation(user.role));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OpnameResult | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'semua' | 'belum' | 'sudah'>('semua');
  const draftKey = sheet ? `mourden.opname.${station}.${sheet.businessDate}` : null;

  useEffect(() => {
    setSheet(null);
    setResult(null);
    setError('');
    api<Sheet>(`/opname/sheet?station=${station}`)
      .then((s) => {
        setSheet(s);
        try {
          setCounts(JSON.parse(localStorage.getItem(`mourden.opname.${station}.${s.businessDate}`) ?? '{}'));
        } catch {
          setCounts({});
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, [station, reload]);

  const setCount = (id: string, v: string) => {
    const clean = v.replace(',', '.').replace(/[^\d.]/g, '');
    const next = { ...counts, [id]: clean };
    setCounts(next);
    if (draftKey) {
      try {
        localStorage.setItem(draftKey, JSON.stringify(next));
      } catch {
        /* abaikan */
      }
    }
  };

  const isFilled = (id: string) => counts[id] !== undefined && counts[id] !== '';
  const items = sheet?.items ?? [];
  const filled = items.filter((i) => isFilled(i.id));
  const progress = items.length ? filled.length / items.length : 0;
  const visible = items.filter((i) => {
    if (query.trim() && !i.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === 'belum') return !isFilled(i.id);
    if (filter === 'sudah') return isFilled(i.id);
    return true;
  });

  const submit = async () => {
    if (!sheet) return;
    const missing = sheet.items.length - filled.length;
    const ok = await confirmDialog({
      title: 'Simpan hasil opname?',
      message: missing
        ? `${missing} bahan belum diisi dan tidak ikut dihitung. Stok sistem akan disesuaikan dengan hitungan Anda.`
        : 'Semua bahan sudah dihitung. Stok sistem akan disesuaikan dengan hitungan Anda.',
      confirmLabel: 'Simpan',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<OpnameResult>(`/opname/${uuid()}`, {
        method: 'PUT',
        body: { station, note, items: filled.map((i) => ({ ingredientId: i.id, countedQty: parseFloat(counts[i.id]) })) },
      });
      if (draftKey) localStorage.removeItem(draftKey);
      setResult(res);
      setCounts({});
      setNote('');
      toast('Opname tersimpan');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) return <OpnameResultView result={result} station={station} isOwner={isOwner} onDone={() => setReload((n) => n + 1)} />;

  return (
    <div className="flex flex-col gap-3">
      {/* Kartu tugas */}
      <section className="bg-grad-header relative overflow-hidden rounded-3xl p-4 text-white shadow-card">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <p className="text-sm text-white/80">
            {greeting()}, {user.name}
          </p>
          <p className="mt-0.5 text-lg font-extrabold tracking-tight">Opname {STATION_LABEL[station]} hari ini</p>
          {sheet?.doneToday ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-sm font-semibold">
              <CheckCircle2 className="size-4" /> Sudah dilakukan {sheet.doneToday.userName} pukul{' '}
              {formatTime(sheet.doneToday.createdAt, tz)}
            </p>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-sm font-semibold">
              <Clock3 className="size-4" /> Belum dikerjakan
            </p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="text-sm font-bold tabular">
              {filled.length}/{items.length}
            </span>
          </div>
          <p className="mt-2 text-xs text-white/75">
            Hitung fisik setiap bahan lalu isi jumlahnya. Draf tersimpan otomatis.{' '}
            {!isOwner && 'Stok sistem disembunyikan supaya hitungan jujur.'}
          </p>
        </div>
      </section>

      {/* Pilih stasiun */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {STATIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStation(s)}
            className={cx(
              'press flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold',
              station === s ? 'bg-grad-accent border-transparent text-white' : 'border-line-strong bg-surface text-fg-muted',
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: station === s ? 'white' : STATION_HUE[s] }} />
            {STATION_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Cari + filter */}
      <div className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center rounded-2xl border border-line bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12">
          <Search className="ml-3 size-5 shrink-0 text-fg-subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bahan…" aria-label="Cari bahan" className="h-full min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-fg-subtle" />
          {query && (
            <button aria-label="Hapus pencarian" onClick={() => setQuery('')} className="mr-1 grid size-10 place-items-center text-fg-muted">
              <X className="size-4" />
            </button>
          )}
        </label>
        <div className="flex shrink-0 rounded-2xl border border-line bg-surface-2 p-1">
          {(
            [
              ['semua', 'Semua'],
              ['belum', 'Belum'],
              ['sudah', 'Sudah'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={cx('press h-10 rounded-xl px-3 text-sm font-semibold', filter === v ? 'bg-surface text-fg shadow-card ring-1 ring-primary/30' : 'text-fg-muted')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {!sheet && !error && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      )}
      {sheet && !items.length && <Empty icon={<ClipboardCheck className="size-8" />} title={`Belum ada bahan di stasiun ${STATION_LABEL[station]}`}>Owner menambahkan bahan di Admin → Inventori.</Empty>}
      {sheet && items.length > 0 && !visible.length && <Empty icon={<Search className="size-8" />} title="Tidak ada bahan yang cocok" />}

      <ul className="flex flex-col gap-2">
        {visible.map((i, idx) => {
          const done = isFilled(i.id);
          return (
            <li
              key={i.id}
              style={{ animationDelay: `${Math.min(idx, 10) * 25}ms` }}
              className={cx('animate-rise flex items-center gap-3 rounded-2xl border-2 bg-surface p-3 transition-colors', done ? 'border-success/50 bg-success/5' : 'border-transparent shadow-card')}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: done ? 'var(--success)' : STATION_HUE[i.station] }}
              >
                {done ? <Check className="size-5" strokeWidth={3} /> : initials(i.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="leading-tight font-semibold">{i.name}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Satuan {i.unit}
                  {isOwner && <> · sistem {formatNumber(i.stock)}</>}
                </p>
              </div>
              <label className={cx('flex h-12 w-32 shrink-0 items-center rounded-xl border bg-surface-2 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15', done ? 'border-success/50' : 'border-line')}>
                <input
                  inputMode="decimal"
                  value={counts[i.id] ?? ''}
                  onChange={(e) => setCount(i.id, e.target.value)}
                  placeholder="0"
                  aria-label={`Jumlah ${i.name}`}
                  className="h-full min-w-0 flex-1 bg-transparent pl-3 text-right text-lg font-bold outline-none tabular placeholder:font-normal placeholder:text-fg-subtle"
                />
                <span className="px-2.5 text-sm font-semibold text-fg-subtle">{i.unit}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {sheet && items.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="flex w-full flex-col gap-2">
            {showNote && (
              <TextInput value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Catatan opname (opsional), mis. susu 2 karton belum dibuka" autoFocus />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNote((v) => !v)}
                aria-label="Tambah catatan"
                className={cx('press grid size-12 shrink-0 place-items-center rounded-xl border', note ? 'border-primary text-primary' : 'border-line text-fg-muted')}
              >
                <StickyNote className="size-5" />
              </button>
              <Button size="lg" variant="success" className="flex-1" icon={<ClipboardCheck className="size-5" />} loading={busy} disabled={!filled.length} onClick={submit}>
                Simpan opname · {filled.length}/{items.length}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OpnameResultView({ result, station, isOwner, onDone }: { result: OpnameResult; station: Station; isOwner: boolean; onDone: () => void }) {
  const diffs = result.items.filter((i) => i.diff !== 0);
  const value = diffs.reduce((s, i) => s + i.diffValue, 0);
  const match = result.items.length - diffs.length;
  return (
    <div className="animate-rise flex flex-col gap-3">
      <section className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface p-6 text-center shadow-card">
        <span className="bg-grad-success animate-pop grid size-16 place-items-center rounded-full text-white shadow-[0_14px_30px_-10px_rgb(18_168_101/0.7)]">
          <Check className="size-8" strokeWidth={3} />
        </span>
        <p className="mt-1 text-xl font-extrabold tracking-tight">Opname {STATION_LABEL[station]} tersimpan</p>
        <p className="text-fg-muted">Terima kasih! Stok sistem sudah disesuaikan dengan hitungan Anda.</p>
      </section>
      <div className={cx('grid gap-2', isOwner ? 'grid-cols-3' : 'grid-cols-2')}>
        <Stat label="Cocok" value={String(match)} tone="good" />
        <Stat label="Ada selisih" value={String(diffs.length)} tone={diffs.length ? 'warn' : 'good'} />
        {isOwner && <Stat label="Nilai selisih" value={formatRupiah(value)} tone={value < 0 ? 'warn' : 'good'} />}
      </div>
      {diffs.length > 0 ? (
        <section className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-2 flex items-center gap-2 font-bold">
            <TriangleAlert className="size-5 text-warning" /> Bahan dengan selisih
          </p>
          <ul className="divide-y divide-line">
            {diffs.map((i) => (
              <li key={i.ingredientId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold">{i.name}</span>
                  <span className="text-xs text-fg-muted">
                    Dihitung {formatNumber(i.countedQty)} {i.unit}
                  </span>
                </span>
                <span className={cx('rounded-lg px-2.5 py-1 text-sm font-bold tabular', i.diff < 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')}>
                  {i.diff > 0 ? '+' : ''}
                  {formatNumber(i.diff)} {i.unit}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-muted">Minus = stok fisik lebih sedikit dari catatan sistem. Owner akan melihat ringkasan ini di dashboard.</p>
        </section>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 p-3 font-semibold text-success">
          <Sparkles className="size-5" /> Semua cocok dengan sistem. Mantap!
        </p>
      )}
      <Button size="lg" onClick={onDone}>
        Selesai
      </Button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' }) {
  return (
    <div className={cx('rounded-2xl border p-3 text-center', tone === 'good' ? 'border-success/25 bg-success/6' : 'border-warning/30 bg-warning/8')}>
      <p className="text-xs font-semibold text-fg-muted">{label}</p>
      <p className="text-xl font-extrabold tabular">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Barang masuk / terbuang

interface LocalEntry {
  id: string;
  type: 'purchase' | 'waste';
  name: string;
  qty: number;
  unit: string;
  note: string;
  at: string;
}

const NOTE_CHIPS: Record<'purchase' | 'waste', string[]> = {
  purchase: ['Belanja pasar', 'Kiriman supplier', 'Ambil gudang'],
  waste: ['Basi', 'Kedaluwarsa', 'Tumpah', 'Rusak', 'Salah buat'],
};

function todayKey(userId: string) {
  return `mourden.stok-catatan.${userId}.${new Date().toDateString()}`;
}

function RecordMovement({ type }: { type: 'purchase' | 'waste' }) {
  const user = useApp((s) => s.user)!;
  const tz = useStoreTz();
  const [items, setItems] = useState<StockLevel[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StockLevel | null>(null);
  const [entries, setEntries] = useState<LocalEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(todayKey(user.id)) ?? '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    api<StockLevel[]>('/ingredients')
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const mine = defaultStation(user.role);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Bahan stasiun sendiri (bar untuk barista, kitchen untuk kitchen) tampil lebih dulu.
    return (items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q)).sort((a, b) => Number(b.station === mine) - Number(a.station === mine));
  }, [items, query, mine]);
  const [showAll, setShowAll] = useState(false);

  const saved = (entry: LocalEntry, fresh: StockLevel[]) => {
    const next = [entry, ...entries].slice(0, 30);
    setEntries(next);
    try {
      localStorage.setItem(todayKey(user.id), JSON.stringify(next));
    } catch {
      /* abaikan */
    }
    if (fresh.length) setItems(fresh);
    setSelected(null);
  };

  const isWaste = type === 'waste';
  return (
    <div className="flex flex-col gap-3">
      <p className={cx('rounded-2xl p-3 text-sm', isWaste ? 'bg-danger/8 text-danger' : 'bg-primary/8 text-primary')}>
        {isWaste
          ? 'Catat bahan yang terbuang (basi, tumpah, rusak) supaya stok tetap sesuai dan owner tahu penyebabnya.'
          : 'Catat bahan yang baru datang. Isi total harga bila ada, agar modal (HPP) menu ikut terbarui.'}
      </p>
      {entries.length > 0 && (
        <section className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-bold">Dicatat hari ini ({entries.length})</p>
            {entries.length > 3 && (
              <button onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-primary">
                {showAll ? 'Ringkas' : 'Lihat semua'}
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {(showAll ? entries : entries.slice(0, 3)).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', e.type === 'waste' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')}>
                  {e.type === 'waste' ? <PackageMinus className="size-5" /> : <PackagePlus className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.name}</span>
                  <span className="text-xs text-fg-muted">
                    {formatTime(e.at, tz)}
                    {e.note && ` · ${e.note}`}
                  </span>
                </span>
                <span className={cx('font-bold tabular', e.type === 'waste' ? 'text-danger' : 'text-success')}>
                  {e.type === 'waste' ? '−' : '+'}
                  {formatNumber(e.qty)} {e.unit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <label className="flex h-12 items-center rounded-2xl border border-line bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12">
        <Search className="ml-3 size-5 shrink-0 text-fg-subtle" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bahan…" aria-label="Cari bahan" className="h-full min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-fg-subtle" />
      </label>
      <ErrorNote>{error}</ErrorNote>
      {!items && !error && (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((i, idx) => (
          <button
            key={i.id}
            onClick={() => setSelected(i)}
            style={{ animationDelay: `${Math.min(idx, 12) * 20}ms` }}
            className="press animate-rise flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-3 text-left shadow-card hover:border-primary/40"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="grid size-9 place-items-center rounded-xl text-xs font-extrabold text-white" style={{ background: STATION_HUE[i.station] }}>
                {initials(i.name)}
              </span>
              {i.status !== 'aman' ? <Badge tone={i.status === 'habis' ? 'red' : 'amber'}>{i.status}</Badge> : <span className="text-xs text-fg-subtle">{STATION_LABEL[i.station]}</span>}
            </span>
            <span className="leading-tight font-semibold">{i.name}</span>
            <span className="text-xs text-fg-muted">Satuan {i.unit}</span>
          </button>
        ))}
      </div>
      {items && !filtered.length && <Empty icon={<Search className="size-8" />} title="Bahan tidak ditemukan" />}


      {selected && <MovementSheet item={selected} type={type} onClose={() => setSelected(null)} onSaved={saved} />}
    </div>
  );
}

function MovementSheet({
  item,
  type,
  onClose,
  onSaved,
}: {
  item: StockLevel;
  type: 'purchase' | 'waste';
  onClose: () => void;
  onSaved: (entry: LocalEntry, fresh: StockLevel[]) => void;
}) {
  const [qty, setQty] = useState('');
  const [totalCost, setTotalCost] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = parseFloat(qty) || 0;
  const isWaste = type === 'waste';
  const steps = item.unit === 'gr' || item.unit === 'ml' ? [50, 100, 500, 1000] : [1, 5, 10, 20];

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const id = uuid();
      await api('/stock/movements', {
        method: 'POST',
        body: { id, ingredientId: item.id, type, qty: amount, totalCost: type === 'purchase' && totalCost ? totalCost : undefined, note },
      });
      toast(`${isWaste ? 'Barang terbuang' : 'Barang masuk'} tercatat: ${item.name}`);
      const fresh = await api<StockLevel[]>('/ingredients').catch(() => null);
      onSaved({ id, type, name: item.name, qty: amount, unit: item.unit, note, at: new Date().toISOString() }, fresh ?? []);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {isWaste ? <PackageMinus className="size-5 text-danger" /> : <PackagePlus className="size-5 text-success" />}
          {isWaste ? 'Terbuang' : 'Barang masuk'} · {item.name}
        </span>
      }
      footer={
        <Button size="lg" variant={isWaste ? 'danger' : 'success'} className="flex-1" loading={busy} disabled={!(amount > 0)} onClick={submit}>
          Simpan {amount > 0 && `${isWaste ? '−' : '+'}${formatNumber(amount)} ${item.unit}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={`Jumlah (${item.unit})`}>
          {(id) => (
            <div className="flex flex-col gap-2">
              <input
                id={id}
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
                placeholder="0"
                autoFocus
                className={cx(inputClass, 'h-14 text-right text-2xl font-extrabold tabular')}
              />
              <div className="grid grid-cols-4 gap-2">
                {steps.map((s) => (
                  <button key={s} onClick={() => setQty(String(Math.round((amount + s) * 1000) / 1000))} className="press h-11 rounded-xl border border-line bg-surface-2 text-sm font-bold tabular">
                    +{formatNumber(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>
        {!isWaste && (
          <Field label="Total harga beli (opsional)" hint="Dipakai untuk menghitung modal (HPP) terbaru.">
            {(id) => <MoneyInput id={id} value={totalCost} onChange={setTotalCost} />}
          </Field>
        )}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-fg-muted">{isWaste ? 'Alasan' : 'Keterangan'}</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {NOTE_CHIPS[type].map((c) => (
              <button
                key={c}
                onClick={() => setNote(c)}
                className={cx('press h-10 rounded-xl px-3 text-sm font-semibold', note === c ? (isWaste ? 'bg-danger text-white' : 'bg-primary text-white') : 'bg-surface-2 text-fg-muted')}
              >
                {c}
              </button>
            ))}
          </div>
          <TextInput value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder={isWaste ? 'Alasan lain' : 'Keterangan lain'} />
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
