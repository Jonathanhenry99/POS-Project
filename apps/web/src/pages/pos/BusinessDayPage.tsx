import { CalendarDays, Lock, Printer, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { businessDate, formatDateTime, formatNumber, formatRupiah, PAYMENT_LABEL, PAYMENT_METHODS, type BusinessDaySummary, type Shift } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, ErrorNote, Field, MoneyInput, Modal, Segmented, TextInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import type { LocalBusinessDay } from '../../lib/idb';
import { businessDayDetails, closeBusinessDay, closeShift, currentShiftSummary, ensureBusinessDay, listBusinessDays, listShifts, refreshShiftHistory, useOrdersVersion } from '../../lib/pos';
import { useApp } from '../../lib/state';
import { printBusinessDay, printShift } from '../../printing/service';
import { useCart, useSaved } from './cart';
import { SummaryTable } from './ShiftPage';

type Tab = 'current' | 'shifts' | 'days';

export function BusinessDayPage() {
  const shift = useApp((s) => s.activeShift);
  const timezone = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const sync = useApp((s) => s.sync);
  const device = useApp((s) => s.device);
  const version = useOrdersVersion();
  const navigate = useNavigate();
  const saved = useSaved();
  const cart = useCart();
  const [tab, setTab] = useState<Tab>('current');
  const [from, setFrom] = useState(() => businessDate(new Date().toISOString(), timezone));
  const [to, setTo] = useState(from);
  const [days, setDays] = useState<LocalBusinessDay[]>([]);
  const [shifts, setShifts] = useState<(Shift & { sync?: string })[]>([]);
  const [activeDay, setActiveDay] = useState<LocalBusinessDay | null>(null);
  const [summary, setSummary] = useState<BusinessDaySummary | null>(null);
  const [closeMode, setCloseMode] = useState<'shift' | 'day' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const day = await ensureBusinessDay();
    const [allDays, allShifts] = await Promise.all([listBusinessDays(), listShifts()]);
    setDays(allDays); setShifts(allShifts); setActiveDay(day);
    setSummary(day ? (await businessDayDetails(day)).summary : null);
  }, []);
  useEffect(() => { void load().catch((e) => setError(errorMessage(e))); }, [load, shift, version, sync.pending, sync.failed]);
  const dateValid = !!from && !!to && from <= to;
  const visibleShifts = useMemo(() => shifts.filter((s) => {
    const date = businessDate(s.openedAt, timezone);
    return date >= from && date <= to;
  }), [shifts, from, to, timezone]);
  const visibleDays = days.filter((d) => d.businessDate >= from && d.businessDate <= to);
  // Keranjang dari pesanan tersimpan dihitung sekali saja.
  const draftCount = saved.length + (cart.lines.length && !cart.savedId ? 1 : 0);

  const finishWithoutShift = async () => {
    const ok = await confirmDialog({ title: 'Tutup hari usaha di tablet ini?', message: `Semua shift sudah ditutup.${draftCount ? ` ${draftCount} pesanan belum dibayar tetap tersimpan untuk dilanjutkan.` : ''} Rekap disimpan di tablet dan menunggu sinkron jika offline.`, confirmLabel: 'Tutup hari' });
    if (!ok) return;
    setBusy(true); setError('');
    try {
      const day = await closeBusinessDay('');
      void printBusinessDay(day); await load(); toast('Hari ditutup di tablet. Periksa status sinkron.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold">Ganti Shift / Hari</h1>
          <p className="text-sm text-fg-muted">{device?.name} · Hari usaha berlaku untuk tablet ini. Mengunci layar kasir tidak menutup shift.</p>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'current', label: 'Rekapitulasi penjualan' }, { value: 'shifts', label: 'Riwayat shift' }, { value: 'days', label: 'Detail rekapitulasi hari' }]} />
        <ErrorNote>{error}</ErrorNote>
        {tab === 'current' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={activeDay ? `Hari usaha ${activeDay.businessDate}` : 'Belum ada hari usaha'} icon={<CalendarDays className="size-5" />}>
              {activeDay && summary ? <>
                <p className="mb-3 text-sm text-fg-muted">Buka {formatDateTime(activeDay.openedAt, timezone)} oleh {activeDay.openedByName}</p>
                <DaySummary summary={summary} />
                <p className="mt-3 text-xs text-fg-muted">Angka shift yang sudah ditutup dikunci saat penutupan. Void sesudahnya tetap terlihat di Riwayat transaksi.</p>
              </> : <p className="text-fg-muted">Buka shift dari layar Kasir untuk memulai hari usaha baru.</p>}
            </Card>
            <Card title="Pergantian petugas dan tutup toko">
              <div className="flex flex-col gap-3">
                {shift ? <>
                  <p className="text-sm">Shift aktif: <b>{shift.openedByName}</b> · {formatDateTime(shift.openedAt, timezone)}</p>
                  <Button size="lg" variant="outline" onClick={() => setCloseMode('shift')}>Akhiri shift</Button>
                  <p className="text-sm text-fg-muted">Hitung kas petugas ini. Shift berikut tetap berada dalam hari usaha yang sama.</p>
                  <Button size="lg" icon={<Lock className="size-5" />} onClick={() => setCloseMode('day')}>Tutup toko / hari</Button>
                  <p className="text-sm text-fg-muted">Tutup shift terakhir lalu simpan rekap hari ini.</p>
                </> : <>
                  <Button onClick={() => navigate('/kasir')}>{activeDay ? 'Buka shift berikutnya' : 'Ke layar kasir'}</Button>
                  {activeDay && <Button variant="outline" loading={busy} onClick={finishWithoutShift}>Tutup hari setelah shift terakhir</Button>}
                </>}
                <Button variant="ghost" onClick={() => navigate('/shift')}>Catat kas masuk / keluar</Button>
                {!!draftCount && <p className="rounded-xl bg-warning/10 p-3 text-sm">{draftCount} pesanan belum dibayar. Penutupan tidak menghapus pesanan ini.</p>}
                {(sync.pending > 0 || sync.failed > 0) && <Button variant="soft" onClick={() => navigate('/sinkron')}>Sinkron: {sync.pending} menunggu · {sync.failed} gagal</Button>}
              </div>
            </Card>
          </div>
        ) : <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Dari tanggal">{(id) => <TextInput id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
            <Field label="Sampai tanggal">{(id) => <TextInput id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            <Button variant="outline" icon={<RefreshCw className="size-5" />} loading={busy} disabled={!dateValid} onClick={async () => {
              setBusy(true); setError('');
              try { const limited = await refreshShiftHistory(from, to); await load(); toast(limited ? 'Arsip dibatasi. Persempit rentang tanggal.' : 'Arsip tablet ini diperbarui.'); }
              catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
            }}>Ambil arsip server</Button>
          </div>
          <p className="text-xs text-fg-muted">Data di tablet tetap bisa dilihat offline. Arsip server butuh internet dan hanya berisi data tablet ini.</p>
          {!dateValid && <ErrorNote>Isi rentang tanggal yang valid.</ErrorNote>}
          {dateValid && tab === 'shifts' && visibleShifts.map((s) => <Card key={s.id} title={s.openedByName} action={s.closedAt ? <Button variant="outline" size="sm" icon={<Printer className="size-4" />} onClick={() => void printShift(s)}>Cetak rekap</Button> : <Badge tone="green">Berjalan</Badge>}>
            <p className="mb-2 text-sm text-fg-muted">{formatDateTime(s.openedAt, timezone)}{s.closedAt && ` – ${formatDateTime(s.closedAt, timezone)}`} · {s.sync === 'synced' ? 'Tersinkron' : s.sync === 'failed' ? 'Sinkron gagal' : 'Menunggu sinkron'}</p>
            {s.summary && <SummaryTable summary={s.summary} openingCash={s.openingCash} />}
            {s.countedCash !== null && s.summary && <p className="mt-2 font-semibold">Kas dihitung {formatRupiah(s.countedCash)} · Selisih {formatRupiah(s.countedCash - s.summary.expectedCash)}</p>}
            {s.closingNote && <p className="mt-2 text-sm">Catatan: {s.closingNote}</p>}
          </Card>)}
          {dateValid && tab === 'days' && visibleDays.map((day) => <Card key={day.id} title={`Hari ${day.businessDate}`} action={<Badge tone={day.sync === 'failed' ? 'red' : day.sync === 'synced' ? 'green' : 'amber'}>{day.closedAt ? day.sync === 'synced' ? 'Ditutup & tersinkron' : day.sync === 'failed' ? 'Sinkron gagal' : 'Ditutup lokal · antre' : 'Berjalan'}</Badge>}>
            <p className="mb-2 text-sm text-fg-muted">Buka {formatDateTime(day.openedAt, timezone)}{day.closedAt && ` · Tutup ${formatDateTime(day.closedAt, timezone)} oleh ${day.closedByName}`}</p>
            {day.summary && <DaySummary summary={day.summary} />}
            <ErrorNote>{day.syncError}</ErrorNote>
            {day.closingNote && <p className="mt-2 text-sm">Catatan: {day.closingNote}</p>}
            {day.closedAt && <Button className="mt-3" variant="outline" icon={<Printer className="size-5" />} onClick={() => void printBusinessDay(day)}>Cetak rekap hari</Button>}
          </Card>)}
          {dateValid && !(tab === 'shifts' ? visibleShifts.length : visibleDays.length) && <p className="py-8 text-center text-fg-muted">Belum ada arsip pada rentang ini.</p>}
        </>}
        <PrintStatusCard />
      </div>
      {closeMode && <DayClosingSheet mode={closeMode} drafts={draftCount} onClose={() => setCloseMode(null)} onFinished={load} />}
    </div>
  );
}

function DaySummary({ summary: s }: { summary: BusinessDaySummary }) {
  const row = (label: string, value: number, bold = false) => <div className={cx('flex justify-between gap-3 py-1', bold && 'font-bold')}><span>{label}</span><span className="tabular">{formatNumber(value)}</span></div>;
  return <div className="text-sm">
    {row('Jumlah shift', s.shiftCount)}{row('Transaksi lunas', s.orderCount)}{row('Penjualan kotor', s.grossSales)}
    {row('Diskon', -s.discountTotal)}{row('Service', s.serviceTotal)}{row('Pajak', s.taxTotal)}{row('Total penjualan', s.netSales, true)}
    <div className="my-2 border-t border-line" />
    {PAYMENT_METHODS.map((m) => <div key={m}>{row(PAYMENT_LABEL[m], s.byMethod[m])}</div>)}
    {row(`Void (${s.voidCount})`, s.voidAmount)}
    <div className="my-2 border-t border-line" />
    {row('Modal shift pertama', s.openingCash)}{row('Kas masuk seluruh shift', s.cashIn)}{row('Kas keluar seluruh shift', -s.cashOut)}
    {row('Kas seharusnya shift terakhir', s.lastExpectedCash)}
    {s.lastCountedCash !== null && row('Kas dihitung shift terakhir', s.lastCountedCash)}
    {row('Selisih seluruh shift', s.cashDifference, true)}
    <p className="mt-2 text-xs text-fg-muted">Modal pergantian shift tidak dijumlah sebagai pendapatan. Nilai laci berasal dari shift terakhir.</p>
  </div>;
}

function DayClosingSheet({ mode, drafts, onClose, onFinished }: { mode: 'shift' | 'day'; drafts: number; onClose: () => void; onFinished: () => Promise<void> }) {
  const [expected, setExpected] = useState<number | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedShift, setSavedShift] = useState<Shift | null>(null);
  useEffect(() => { void currentShiftSummary().then((s) => setExpected(s?.expectedCash ?? null)); }, []);
  const submit = async () => {
    if (counted === null || expected === null) return;
    if (!savedShift && counted !== expected && !await confirmDialog({ title: 'Ada selisih kas', message: `Selisih ${formatRupiah(counted - expected)}. Tetap tutup?`, confirmLabel: 'Tetap tutup', danger: true })) return;
    setBusy(true); setError('');
    try {
      const closed = savedShift ?? await closeShift(counted, note, mode);
      setSavedShift(closed);
      if (mode === 'day') { const day = await closeBusinessDay(note); void printBusinessDay(day); }
      else void printShift(closed);
      await onFinished(); onClose(); toast(mode === 'day' ? 'Hari ditutup lokal; status sinkron tersedia di rekap.' : 'Shift diakhiri. Hari usaha tetap berjalan.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} dismissable={!busy} title={mode === 'day' ? 'Tutup toko / hari' : 'Akhiri shift'} footer={<Button className="flex-1" size="lg" loading={busy} disabled={counted === null || expected === null} onClick={submit}>{savedShift ? 'Lanjutkan tutup hari' : mode === 'day' ? 'Tutup shift terakhir & hari' : 'Akhiri shift & cetak'}</Button>}>
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">Uang di laci seharusnya</p><p className="text-2xl font-bold tabular">{expected === null ? 'Menghitung…' : formatRupiah(expected)}</p>
      <Field label="Uang tunai yang dihitung">{(id) => <MoneyInput id={id} value={counted ?? 0} onChange={setCounted} disabled={!!savedShift} autoFocus />}</Field>
      <Button variant="soft" disabled={!!savedShift} onClick={() => setCounted(0)}>Kas dihitung Rp0</Button>
      <Field label="Catatan (opsional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} disabled={!!savedShift} />}</Field>
      {!!drafts && <p className="text-sm text-warning">{drafts} pesanan belum dibayar tetap tersimpan.</p>}
      <p className="text-sm text-fg-muted">Tersimpan di tablet terlebih dahulu. Gangguan internet atau printer tidak membatalkan penutupan.</p>
      {savedShift && error && <p className="text-sm">Shift sudah ditutup. Coba lanjutkan penutupan hari; jangan hitung shift dua kali.</p>}
      <ErrorNote>{error}</ErrorNote>
    </div>
  </Modal>;
}
