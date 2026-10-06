import { ArrowLeft, ClipboardCheck, LogOut, PackageMinus, PackagePlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { can, defaultStation, formatNumber, formatRupiah, STATION_LABEL, type StockLevel, type Station } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, Empty, ErrorNote, Field, MoneyInput, Segmented, Spinner, TextInput, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { uuid } from '../../lib/id';
import { logout } from '../../lib/session';
import { useApp } from '../../lib/state';

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

export function StockPage() {
  const user = useApp((s) => s.user)!;
  const mode = useApp((s) => s.mode);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'opname' | 'catat'>('opname');
  const canSell = mode === 'tablet' && can(user.role, 'pos.sell');

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-2 bg-grad-header px-3 text-white">
        {(canSell || can(user.role, 'admin')) && (
          <Link to={canSell ? '/kasir' : '/admin'} className="grid size-11 place-items-center rounded-xl hover:bg-white/10" aria-label="Kembali">
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <span className="flex-1 text-lg font-bold">Stok</span>
        <span className="text-sm">{user.name}</span>
        <button
          aria-label="Keluar"
          className="grid size-11 place-items-center rounded-xl hover:bg-white/10"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut className="size-5" />
        </button>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'opname', label: 'Stock opname' },
            { value: 'catat', label: 'Barang masuk / terbuang' },
          ]}
        />
        {tab === 'opname' ? <Opname /> : <RecordMovement />}
      </div>
    </div>
  );
}

function Opname() {
  const user = useApp((s) => s.user)!;
  const isOwner = can(user.role, 'admin');
  const [station, setStation] = useState<Station>(defaultStation(user.role));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OpnameResult | null>(null);
  const [reload, setReload] = useState(0);
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

  const filled = sheet?.items.filter((i) => counts[i.id] !== undefined && counts[i.id] !== '') ?? [];

  const submit = async () => {
    if (!sheet) return;
    const missing = sheet.items.length - filled.length;
    const ok = await confirmDialog({
      title: 'Simpan hasil opname?',
      message: missing
        ? `${missing} bahan belum diisi dan tidak ikut dihitung. Stok sistem akan disesuaikan dengan hitungan Anda.`
        : 'Stok sistem akan disesuaikan dengan hitungan Anda.',
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

  if (result) {
    const diffs = result.items.filter((i) => i.diff !== 0);
    const value = diffs.reduce((s, i) => s + i.diffValue, 0);
    return (
      <Card title="Hasil opname">
        <p className="mb-3 text-fg-muted">
          {result.items.length} bahan dihitung · {diffs.length} ada selisih
          {isOwner && ` · nilai selisih ${formatRupiah(value)}`}
        </p>
        {diffs.length === 0 ? (
          <p className="font-semibold text-success">Semua cocok dengan sistem. Mantap!</p>
        ) : (
          <ul className="divide-y divide-line">
            {diffs.map((i) => (
              <li key={i.ingredientId} className="flex justify-between py-2">
                <span>{i.name}</span>
                <span className={cx('font-semibold tabular', i.diff < 0 ? 'text-danger' : 'text-success')}>
                  {i.diff > 0 ? '+' : ''}
                  {formatNumber(i.diff)} {i.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-4 w-full" onClick={() => setReload((n) => n + 1)}>
          Kembali ke daftar
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        value={station}
        onChange={setStation}
        options={(['bar', 'kitchen', 'umum'] as Station[]).map((s) => ({ value: s, label: STATION_LABEL[s] }))}
      />
      <ErrorNote>{error}</ErrorNote>
      {!sheet && !error && <Spinner className="mx-auto my-8" />}
      {sheet && (
        <>
          {sheet.doneToday && (
            <p className="rounded-xl bg-success/10 p-3 text-sm text-success">
              Opname {STATION_LABEL[station]} hari ini sudah dilakukan oleh {sheet.doneToday.userName}. Mengisi lagi akan membuat opname baru.
            </p>
          )}
          <p className="text-sm text-fg-muted">
            Hitung stok fisik setiap bahan lalu isi jumlahnya. {!isOwner && 'Stok sistem disembunyikan supaya hitungan jujur.'}
          </p>
          {!sheet.items.length ? (
            <Empty title="Belum ada bahan di stasiun ini" />
          ) : (
            <ul className="flex flex-col gap-2">
              {sheet.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{i.name}</p>
                    {isOwner && (
                      <p className="text-xs text-fg-muted">
                        Sistem: {formatNumber(i.stock)} {i.unit}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      value={counts[i.id] ?? ''}
                      onChange={(e) => setCount(i.id, e.target.value)}
                      placeholder="0"
                      aria-label={`Jumlah ${i.name}`}
                      className={cx(inputClass, 'w-28 text-right text-lg tabular')}
                    />
                    <span className="w-12 text-sm text-fg-muted">{i.unit}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <TextInput value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Catatan (opsional)" />
          <Button size="lg" variant="success" icon={<ClipboardCheck className="size-5" />} loading={busy} disabled={!filled.length} onClick={submit}>
            Simpan opname ({filled.length}/{sheet.items.length})
          </Button>
        </>
      )}
    </div>
  );
}

function RecordMovement() {
  const [items, setItems] = useState<StockLevel[] | null>(null);
  const [error, setError] = useState('');
  const [type, setType] = useState<'purchase' | 'waste'>('purchase');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StockLevel | null>(null);
  const [qty, setQty] = useState('');
  const [totalCost, setTotalCost] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<StockLevel[]>('/ingredients')
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, query]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api('/stock/movements', {
        method: 'POST',
        body: { id: uuid(), ingredientId: selected.id, type, qty: parseFloat(qty), totalCost: type === 'purchase' && totalCost ? totalCost : undefined, note },
      });
      toast(`${type === 'purchase' ? 'Barang masuk' : 'Barang terbuang'} tercatat: ${selected.name}`);
      setSelected(null);
      setQty('');
      setTotalCost(0);
      setNote('');
      setItems(await api<StockLevel[]>('/ingredients'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'purchase', label: <span className="inline-flex items-center gap-1"><PackagePlus className="size-4" /> Barang masuk</span> },
          { value: 'waste', label: <span className="inline-flex items-center gap-1"><PackageMinus className="size-4" /> Terbuang / rusak</span> },
        ]}
      />
      <ErrorNote>{error}</ErrorNote>
      {!selected ? (
        <>
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari bahan…" />
          {!items && !error && <Spinner className="mx-auto my-8" />}
          <ul className="flex flex-col gap-2">
            {filtered.map((i) => (
              <li key={i.id}>
                <button onClick={() => setSelected(i)} className="flex w-full items-center justify-between rounded-2xl bg-surface p-3 text-left">
                  <span className="font-semibold">{i.name}</span>
                  <span className="flex items-center gap-2 text-sm text-fg-muted">
                    {i.status !== 'aman' && <Badge tone={i.status === 'habis' ? 'red' : 'amber'}>{i.status}</Badge>}
                    {STATION_LABEL[i.station]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Card title={selected.name} action={<Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Ganti</Button>}>
          <div className="flex flex-col gap-4">
            <Field label={`Jumlah (${selected.unit})`}>
              {(id) => <TextInput id={id} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} autoFocus />}
            </Field>
            {type === 'purchase' && (
              <Field label="Total harga beli (opsional)" hint="Dipakai untuk menghitung HPP terbaru.">
                {(id) => <MoneyInput id={id} value={totalCost} onChange={setTotalCost} />}
              </Field>
            )}
            <Field label="Keterangan">
              {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder={type === 'waste' ? 'Contoh: susu basi' : 'Contoh: belanja pasar'} />}
            </Field>
            <Button size="lg" variant="success" loading={busy} disabled={!(parseFloat(qty) > 0)} onClick={submit}>
              Simpan
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
