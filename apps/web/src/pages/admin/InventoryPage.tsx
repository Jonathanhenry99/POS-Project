import { PackageMinus, PackagePlus, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime, formatNumber, formatRupiah, STATION_LABEL, type StockLevel, type Station } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, Button, Empty, ErrorNote, Field, Modal, MoneyInput, Segmented, Spinner, TextInput, Toggle, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { uuid } from '../../lib/id';
import { refreshBootstrap } from '../../lib/sync';
import { PageHeader } from './AdminRoutes';
import { addDays, formatDateLabel, storeTimezone, today, useApi } from './hooks';
import { DateRangeBar } from './ReportsPage';

const TYPE_LABEL: Record<string, string> = {
  sale: 'Terjual',
  void: 'Void',
  purchase: 'Masuk',
  waste: 'Terbuang',
  opname: 'Opname',
  adjust: 'Koreksi',
};

export function InventoryPage() {
  const [tab, setTab] = useState<'stok' | 'riwayat' | 'opname'>('stok');
  return (
    <div className="p-4">
      <PageHeader title="Stok bahan" subtitle="Stok berkurang otomatis dari penjualan sesuai resep" />
      <div className="mb-4 max-w-md">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stok', label: 'Stok' },
            { value: 'riwayat', label: 'Pergerakan' },
            { value: 'opname', label: 'Opname' },
          ]}
        />
      </div>
      {tab === 'stok' && <StockLevels />}
      {tab === 'riwayat' && <Movements />}
      {tab === 'opname' && <OpnameHistory />}
    </div>
  );
}

type MoveType = 'purchase' | 'waste' | 'adjust';

function StockLevels() {
  const { data, error, loading, reload } = useApi<StockLevel[]>('/ingredients');
  const [station, setStation] = useState<'all' | Station>('all');
  const [editing, setEditing] = useState<StockLevel | 'new' | null>(null);
  const [moving, setMoving] = useState<{ item: StockLevel; type: MoveType } | null>(null);
  const list = (data ?? []).filter((i) => station === 'all' || i.station === station);
  const value = list.reduce((s, i) => s + Math.max(0, i.stock) * i.costPerUnit, 0);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-80">
          <Segmented
            value={station}
            onChange={setStation}
            options={[{ value: 'all' as const, label: 'Semua' }, ...(['bar', 'kitchen', 'umum'] as Station[]).map((s) => ({ value: s, label: STATION_LABEL[s] }))]}
          />
        </div>
        <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>
          Tambah bahan
        </Button>
        <span className="ml-auto text-sm text-stone-600">Nilai stok ± {formatRupiah(value)}</span>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !list.length && <Empty title="Belum ada bahan" />}
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-3 py-2">Bahan</th>
                <th className="px-3 py-2 text-right">Stok</th>
                <th className="px-3 py-2 text-right">Min.</th>
                <th className="px-3 py-2 text-right">Pakai/hari</th>
                <th className="px-3 py-2 text-right">Habis dalam</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{i.name}</p>
                    <p className="text-xs text-stone-500">
                      {STATION_LABEL[i.station]} · {formatRupiah(i.costPerUnit)}/{i.unit}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular">
                    {formatNumber(i.stock)} {i.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-500 tabular">{formatNumber(i.minStock)}</td>
                  <td className="px-3 py-2 text-right text-stone-500 tabular">{i.avgDailyUsage ? formatNumber(i.avgDailyUsage) : '-'}</td>
                  <td className="px-3 py-2 text-right tabular">{i.daysLeft === null ? '-' : `± ${i.daysLeft} hari`}</td>
                  <td className="px-3 py-2">
                    <Badge tone={i.status === 'aman' ? 'green' : i.status === 'menipis' ? 'amber' : 'red'}>{i.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn label="Barang masuk" onClick={() => setMoving({ item: i, type: 'purchase' })}>
                        <PackagePlus className="size-5 text-emerald-700" />
                      </IconBtn>
                      <IconBtn label="Terbuang" onClick={() => setMoving({ item: i, type: 'waste' })}>
                        <PackageMinus className="size-5 text-red-700" />
                      </IconBtn>
                      <IconBtn label="Koreksi stok" onClick={() => setMoving({ item: i, type: 'adjust' })}>
                        <SlidersHorizontal className="size-5" />
                      </IconBtn>
                      <IconBtn label="Ubah bahan" onClick={() => setEditing(i)}>
                        <Pencil className="size-5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <IngredientForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {moving && <MovementForm item={moving.item} type={moving.type} onClose={() => setMoving(null)} onSaved={reload} />}
    </>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid size-10 place-items-center rounded-lg hover:bg-stone-100">
      {children}
    </button>
  );
}

function IngredientForm({ item, onClose, onSaved }: { item: StockLevel | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    unit: item?.unit ?? 'gr',
    station: item?.station ?? ('bar' as Station),
    minStock: String(item?.minStock ?? ''),
    costPerUnit: String(item?.costPerUnit ?? ''),
    active: item?.active ?? true,
    initialStock: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;

  const submit = async () => {
    setBusy(true);
    try {
      const body = { name: form.name, unit: form.unit, station: form.station, minStock: num(form.minStock), costPerUnit: num(form.costPerUnit), active: form.active };
      if (item) await api(`/ingredients/${item.id}`, { method: 'PATCH', body });
      else await api('/ingredients', { method: 'POST', body: { ...body, initialStock: num(form.initialStock) || undefined } });
      toast('Bahan disimpan');
      void refreshBootstrap();
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={item ? 'Ubah bahan' : 'Bahan baru'} footer={<Button className="flex-1" size="lg" loading={busy} disabled={!form.name.trim() || !form.unit.trim()} onClick={submit}>Simpan</Button>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Nama bahan">{(id) => <TextInput id={id} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}</Field>
        </div>
        <Field label="Satuan" hint="gr, ml, pcs, lembar">
          {(id) => <TextInput id={id} value={form.unit} onChange={(e) => set('unit', e.target.value)} />}
        </Field>
        <Field label="Stasiun opname">
          {(id) => (
            <select id={id} value={form.station} onChange={(e) => set('station', e.target.value as Station)} className={inputClass}>
              {(['bar', 'kitchen', 'umum'] as Station[]).map((s) => (
                <option key={s} value={s}>
                  {STATION_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={`Stok minimum (${form.unit})`} hint="Di bawah ini muncul peringatan.">
          {(id) => <TextInput id={id} inputMode="decimal" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} />}
        </Field>
        <Field label={`Harga per ${form.unit || 'satuan'} (Rp)`} hint="Untuk menghitung HPP.">
          {(id) => <TextInput id={id} inputMode="decimal" value={form.costPerUnit} onChange={(e) => set('costPerUnit', e.target.value)} />}
        </Field>
        {!item && (
          <Field label={`Stok awal (${form.unit})`}>
            {(id) => <TextInput id={id} inputMode="decimal" value={form.initialStock} onChange={(e) => set('initialStock', e.target.value)} />}
          </Field>
        )}
        <div className="col-span-2">
          <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Aktif" />
        </div>
        <div className="col-span-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </Modal>
  );
}

function MovementForm({ item, type, onClose, onSaved }: { item: StockLevel; type: MoveType; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState('');
  const [sign, setSign] = useState<'+' | '-'>('-');
  const [totalCost, setTotalCost] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = parseFloat(qty.replace(',', '.')) || 0;
  const title = type === 'purchase' ? 'Barang masuk' : type === 'waste' ? 'Barang terbuang' : 'Koreksi stok';

  const submit = async () => {
    setBusy(true);
    try {
      await api('/stock/movements', {
        method: 'POST',
        body: { id: uuid(), ingredientId: item.id, type, qty: type === 'adjust' && sign === '-' ? -amount : amount, totalCost: type === 'purchase' && totalCost ? totalCost : undefined, note },
      });
      toast(`${title}: ${item.name}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal open size="sm" onClose={onClose} title={`${title} · ${item.name}`} footer={<Button className="flex-1" size="lg" loading={busy} disabled={amount <= 0} onClick={submit}>Simpan</Button>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-stone-600">
          Stok sekarang: {formatNumber(item.stock)} {item.unit}
        </p>
        {type === 'adjust' && (
          <Segmented
            value={sign}
            onChange={setSign}
            options={[
              { value: '-', label: 'Kurangi' },
              { value: '+', label: 'Tambah' },
            ]}
          />
        )}
        <Field label={`Jumlah (${item.unit})`}>{(id) => <TextInput id={id} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />}</Field>
        {type === 'purchase' && <Field label="Total harga beli (opsional)">{(id) => <MoneyInput id={id} value={totalCost} onChange={setTotalCost} />}</Field>}
        <Field label="Keterangan">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

interface Movement {
  id: string;
  ingredientName: string;
  unit: string;
  qty: number;
  type: string;
  note: string;
  userName: string | null;
  createdAt: string;
}

function Movements() {
  const [range, setRange] = useState({ from: today(), to: today() });
  const [type, setType] = useState('');
  const { data, error, loading } = useApi<Movement[]>(`/stock/movements?from=${range.from}&to=${range.to}${type ? `&type=${type}` : ''}`);
  const tz = storeTimezone();
  return (
    <>
      <DateRangeBar value={range} onChange={setRange} />
      <select value={type} onChange={(e) => setType(e.target.value)} className={cx(inputClass, 'mb-3 h-11 w-56')}>
        <option value="">Semua jenis</option>
        {Object.entries(TYPE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !data.length && <Empty title="Tidak ada pergerakan" />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {data.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div>
                <p className="font-semibold">
                  {m.ingredientName} <Badge>{TYPE_LABEL[m.type]}</Badge>
                </p>
                <p className="text-xs text-stone-500">
                  {formatDateTime(m.createdAt, tz)}
                  {m.userName && ` · ${m.userName}`}
                  {m.note && ` · ${m.note}`}
                </p>
              </div>
              <span className={cx('font-semibold tabular', m.qty < 0 ? 'text-red-700' : 'text-emerald-700')}>
                {m.qty > 0 ? '+' : ''}
                {formatNumber(m.qty)} {m.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface OpnameRow {
  id: string;
  station: Station;
  businessDate: string;
  userName: string;
  itemCount: number;
  diffCount: number;
  diffValue: number;
}

interface OpnameDetail {
  items: { ingredientId: string; name: string; unit: string; systemQty: number; countedQty: number; diff: number; diffValue: number }[];
}

function OpnameHistory() {
  const [range, setRange] = useState({ from: addDays(today(), -6), to: today() });
  const { data, error, loading } = useApi<OpnameRow[]>(`/opname?from=${range.from}&to=${range.to}`);
  const [open, setOpen] = useState<OpnameRow | null>(null);
  const detail = useApi<OpnameDetail>(open ? `/opname/${open.id}` : null);
  return (
    <>
      <DateRangeBar value={range} onChange={setRange} />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !data.length && <Empty title="Belum ada opname di rentang ini" />}
      <ul className="flex flex-col gap-2">
        {data?.map((o) => (
          <li key={o.id}>
            <button onClick={() => setOpen(o)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left hover:bg-stone-50">
              <div>
                <p className="font-semibold">
                  {formatDateLabel(o.businessDate)} · {STATION_LABEL[o.station]}
                </p>
                <p className="text-sm text-stone-500">
                  {o.userName} · {o.itemCount} bahan · {o.diffCount} selisih
                </p>
              </div>
              <span className={cx('font-semibold tabular', o.diffValue < 0 ? 'text-red-700' : o.diffValue > 0 ? 'text-emerald-700' : 'text-stone-500')}>{formatRupiah(o.diffValue)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Modal open onClose={() => setOpen(null)} title={`Opname ${STATION_LABEL[open.station]} · ${formatDateLabel(open.businessDate)}`}>
          {!detail.data ? (
            <Spinner className="mx-auto my-6" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1">Bahan</th>
                  <th className="py-1 text-right">Sistem</th>
                  <th className="py-1 text-right">Hitung</th>
                  <th className="py-1 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {detail.data.items.map((i) => (
                  <tr key={i.ingredientId}>
                    <td className="py-2">{i.name}</td>
                    <td className="py-2 text-right tabular">{formatNumber(i.systemQty)}</td>
                    <td className="py-2 text-right tabular">{formatNumber(i.countedQty)}</td>
                    <td className={cx('py-2 text-right font-semibold tabular', i.diff < 0 ? 'text-red-700' : i.diff > 0 ? 'text-emerald-700' : 'text-stone-400')}>
                      {i.diff > 0 ? '+' : ''}
                      {formatNumber(i.diff)} {i.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </>
  );
}
