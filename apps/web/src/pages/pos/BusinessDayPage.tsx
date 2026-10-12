import { ArrowDownCircle, ArrowUpCircle, Banknote, CalendarDays, CreditCard, Lock, Percent, Printer, QrCode, Receipt, RefreshCw, TrendingUp, Undo2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { businessDate, formatDateTime, formatNumber, formatRupiah, PAYMENT_LABEL, PAYMENT_METHODS, type BusinessDaySummary, type Shift, type ShiftSummary } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, ErrorNote, Field, MoneyInput, Modal, Segmented, TextInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import type { LocalBusinessDay } from '../../lib/idb';
import { businessDayDetails, closeBusinessDay, currentShiftSummary, ensureBusinessDay, lastClosedShift, listBusinessDays, listShifts, refreshShiftHistory, useOrdersVersion } from '../../lib/pos';
import { useApp, useBlindCash } from '../../lib/state';
import { printBusinessDay, printShift } from '../../printing/service';
import { useCart, useSaved } from './cart';
import { CashMovementSheet, ClosedShiftCard, SummaryTable } from './ShiftParts';
import { ClosingSheet } from './ClosingSheet';
import { Reconciliation } from '../../components/Reconciliation';

// Mengikuti menu "Ganti Shift / Hari" di ESB: rincian shift + akhiri shift/tutup toko, rekap hari, lalu riwayat.
type Tab = 'shift' | 'current' | 'shifts' | 'days';

export function BusinessDayPage() {
  const shift = useApp((s) => s.activeShift);
  const timezone = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const sync = useApp((s) => s.sync);
  const device = useApp((s) => s.device);
  const version = useOrdersVersion();
  const navigate = useNavigate();
  const saved = useSaved();
  const cart = useCart();
  const blind = useBlindCash();
  const [tab, setTab] = useState<Tab>('shift');
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [lastClosed, setLastClosed] = useState<Shift | null>(null);
  const [cashSheet, setCashSheet] = useState(false);
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
    setShiftSummary(await currentShiftSummary());
    setLastClosed(await lastClosedShift());
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
          <h1 className="text-2xl font-semibold tracking-tight">Ganti Shift / Hari</h1>
          <p className="text-sm text-fg-muted">{device?.name} · Hari usaha berlaku untuk tablet ini. Mengunci layar kasir tidak menutup shift.</p>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'shift', label: 'Shift ini' }, { value: 'current', label: 'Rekap hari ini' }, { value: 'shifts', label: 'Riwayat shift' }, { value: 'days', label: 'Riwayat hari' }]} />
        <ErrorNote>{error}</ErrorNote>
        {tab === 'shift' || tab === 'current' ? (
          <div className="flex flex-col gap-4">
            <section className="tile flex flex-wrap items-center gap-4 p-4">
              <span className="icon-chip"><CalendarDays className="size-[18px]" /></span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-lg leading-tight font-semibold tracking-tight">{activeDay ? `Hari usaha ${dayLabel(activeDay.businessDate)}` : 'Belum ada hari usaha'}</p>
                <p className="text-sm text-fg-muted">
                  {activeDay ? `Dibuka ${formatDateTime(activeDay.openedAt, timezone)} oleh ${activeDay.openedByName}${summary ? ` · ${summary.shiftCount} shift` : ''}` : 'Buka shift dari layar Kasir untuk memulai hari usaha baru.'}
                </p>
              </div>
              <span className={cx('rounded-full px-3 py-1.5 text-sm font-semibold', shift ? 'bg-success/12 text-success' : 'bg-surface-3 text-fg-muted')}>
                {shift ? `Shift aktif · ${shift.openedByName}` : 'Tidak ada shift aktif'}
              </span>
            </section>

            {tab === 'current' && activeDay && summary && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <DayStat icon={<TrendingUp className="size-[18px]" />} label="Total penjualan" value={formatRupiah(summary.netSales)} />
                <DayStat icon={<Receipt className="size-[18px]" />} label="Transaksi lunas" value={formatNumber(summary.orderCount)} />
                <DayStat icon={<Percent className="size-[18px]" />} label="Diskon" value={formatRupiah(summary.discountTotal)} />
                <DayStat icon={<Undo2 className="size-[18px]" />} label={`Void (${summary.voidCount})`} value={formatRupiah(summary.voidAmount)} tone={summary.voidCount ? 'text-danger' : undefined} />
              </div>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-w-0 flex-col gap-4">
                {tab === 'shift' && <ShiftNow shift={shift} summary={shiftSummary} lastClosed={lastClosed} blind={blind} timezone={timezone} onCash={() => setCashSheet(true)} />}
                {tab === 'current' && !activeDay && <p className="tile p-4 text-sm text-fg-muted">Belum ada hari usaha yang berjalan. Buka shift dari layar Kasir untuk memulainya.</p>}
                {tab === 'current' && activeDay && summary && (
                  <>
                    <section className="tile p-5">
                      <h3 className="mb-2 font-semibold">Penjualan</h3>
                      <Line label="Penjualan kotor" value={summary.grossSales} />
                      <Line label="Diskon" value={-summary.discountTotal} />
                      <Line label="Service" value={summary.serviceTotal} />
                      <Line label="Pajak" value={summary.taxTotal} />
                      <Line label="Total penjualan" value={summary.netSales} strong />
                    </section>
                    {blind ? (
                      <p className="tile p-4 text-sm text-fg-muted">Rincian per metode pembayaran dan kas laci tampil setelah shift ditutup. Saat mengakhiri shift, hitung uang dan ketik angka struk settlement apa adanya.</p>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        <section className="tile p-5">
                          <h3 className="mb-3 font-semibold">Pembayaran</h3>
                          <div className="flex flex-col gap-3">
                            {PAYMENT_METHODS.map((m) => {
                              const share = summary.netSales > 0 ? (summary.byMethod[m] / summary.netSales) * 100 : 0;
                              return (
                                <div key={m}>
                                  <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="flex items-center gap-2 font-medium"><span className="text-fg-muted">{METHOD_ICON[m]}</span>{PAYMENT_LABEL[m]}</span>
                                    <span className="font-semibold tabular">{formatNumber(summary.byMethod[m])}</span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} /></div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="mt-3 text-xs text-fg-muted">QRIS dan Debit/Kredit dicocokkan dengan struk settlement EDC saat shift diakhiri.</p>
                        </section>
                        <section className="tile p-5">
                          <h3 className="mb-2 font-semibold">Kas laci</h3>
                          <Line label="Modal shift pertama" value={summary.openingCash} />
                          <Line label="Penjualan tunai" value={summary.byMethod.cash} />
                          <Line label="Kas masuk" value={summary.cashIn} />
                          <Line label="Kas keluar" value={-summary.cashOut} />
                          <Line label="Seharusnya di laci (shift terakhir)" value={summary.lastExpectedCash} strong />
                          {summary.lastCountedCash !== null && <Line label="Dihitung shift terakhir" value={summary.lastCountedCash} />}
                          {summary.shiftCount > 1 && <Line label="Selisih seluruh shift" value={summary.cashDifference} tone={summary.cashDifference < 0 ? 'text-danger' : undefined} />}
                        </section>
                      </div>
                    )}
                    <p className="text-xs text-fg-muted">Angka shift yang sudah ditutup dikunci saat penutupan. Void sesudahnya tetap terlihat di Riwayat transaksi. Modal pergantian shift tidak dijumlah sebagai pendapatan.</p>
                  </>
                )}
              </div>

              <section className="tile flex flex-col gap-3 p-5 lg:sticky lg:top-4">
                <h3 className="font-semibold">Akhiri shift atau tutup toko</h3>
                {shift ? (
                  <>
                    <ul className="flex flex-col gap-2 text-sm">
                      <Check ok={!draftCount} text={draftCount ? `${draftCount} pesanan belum dibayar (tidak ikut terhapus)` : 'Tidak ada pesanan yang belum dibayar'} />
                      <Check ok={!sync.pending && !sync.failed} text={sync.pending || sync.failed ? `Sinkron: ${sync.pending} menunggu, ${sync.failed} gagal` : 'Semua data sudah tersinkron'} />
                      <Check ok text="Siapkan: uang tunai di laci dan struk settlement EDC" />
                    </ul>
                    <Button size="lg" variant="outline" onClick={() => setCloseMode('shift')}>Akhiri shift</Button>
                    <p className="-mt-1 text-xs text-fg-muted">Ganti petugas: hitung kas dan settlement shift ini. Hari usaha tetap berjalan.</p>
                    <Button size="lg" icon={<Lock className="size-5" />} onClick={() => setCloseMode('day')}>Tutup toko</Button>
                    <p className="-mt-1 text-xs text-fg-muted">Tutup shift terakhir lalu simpan rekap hari ini.</p>
                  </>
                ) : (
                  <>
                    <Button onClick={() => navigate('/kasir')}>{activeDay ? 'Buka shift berikutnya' : 'Ke layar kasir'}</Button>
                    {activeDay && <Button variant="outline" loading={busy} onClick={finishWithoutShift}>Tutup toko (shift terakhir sudah diakhiri)</Button>}
                  </>
                )}
                {shift && tab === 'current' && <Button variant="ghost" onClick={() => setCashSheet(true)}>Catat kas masuk / keluar</Button>}
                {(sync.pending > 0 || sync.failed > 0) && <Button variant="soft" onClick={() => navigate('/sinkron')}>Buka sinkronisasi</Button>}
              </section>
            </div>
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
            {s.closedAt && <div className="mb-3"><Reconciliation shift={s} /></div>}
            {s.summary && <SummaryTable summary={s.summary} openingCash={s.openingCash} blind={blind && !s.closedAt} />}
            {s.closingNote && <p className="mt-2 text-sm">Catatan: {s.closingNote}</p>}
          </Card>)}
          {dateValid && tab === 'days' && visibleDays.map((day) => <Card key={day.id} title={`Hari ${day.businessDate}`} action={<Badge tone={day.sync === 'failed' ? 'red' : day.sync === 'synced' ? 'green' : 'amber'}>{day.closedAt ? day.sync === 'synced' ? 'Ditutup & tersinkron' : day.sync === 'failed' ? 'Sinkron gagal' : 'Ditutup lokal · antre' : 'Berjalan'}</Badge>}>
            <p className="mb-2 text-sm text-fg-muted">Buka {formatDateTime(day.openedAt, timezone)}{day.closedAt && ` · Tutup ${formatDateTime(day.closedAt, timezone)} oleh ${day.closedByName}`}</p>
            {day.summary && <DaySummary summary={day.summary} blind={blind && !day.closedAt} />}
            <ErrorNote>{day.syncError}</ErrorNote>
            {day.closingNote && <p className="mt-2 text-sm">Catatan: {day.closingNote}</p>}
            {day.closedAt && <Button className="mt-3" variant="outline" icon={<Printer className="size-5" />} onClick={() => void printBusinessDay(day)}>Cetak rekap hari</Button>}
          </Card>)}
          {dateValid && !(tab === 'shifts' ? visibleShifts.length : visibleDays.length) && <p className="py-8 text-center text-fg-muted">Belum ada arsip pada rentang ini.</p>}
        </>}
        <PrintStatusCard />
      </div>
      {cashSheet && <CashMovementSheet onClose={() => setCashSheet(false)} />}
      {closeMode && <ClosingSheet mode={closeMode} drafts={draftCount} onClose={() => setCloseMode(null)} onFinished={load} />}
    </div>
  );
}

const METHOD_ICON: Record<string, React.ReactNode> = { cash: <Banknote className="size-4" />, qris: <QrCode className="size-4" />, card: <CreditCard className="size-4" /> };
const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function DayStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="tile flex min-w-0 items-center gap-3 p-4">
      <span className="icon-chip">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg-muted">{label}</p>
        <p className={cx('truncate text-xl leading-tight font-semibold tracking-tight tabular', tone)}>{value}</p>
      </div>
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) {
  return (
    <div className={cx('flex justify-between gap-3 py-1.5 text-sm', strong && 'mt-1 border-t border-line pt-2.5 text-base font-semibold')}>
      <span className={strong ? undefined : 'text-fg-muted'}>{label}</span>
      <span className={cx('tabular', tone)}>{formatNumber(value)}</span>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold', ok ? 'bg-success/15 text-success' : 'bg-warning/20 text-[#8a5a00]')}>{ok ? '✓' : '!'}</span>
      <span className={ok ? 'text-fg-muted' : 'font-medium'}>{text}</span>
    </li>
  );
}

/** Tab "Shift ini": padanan layar Akhiri Shift di ESB (kasir, mulai shift, kas awal, tunai, pengeluaran, total kas akhir). */
function ShiftNow({ shift, summary, lastClosed, blind, timezone, onCash }: { shift: Shift | null; summary: ShiftSummary | null; lastClosed: Shift | null; blind: boolean; timezone: string; onCash: () => void }) {
  if (!shift) {
    return (
      <>
        <section className="tile p-5">
          <h3 className="font-semibold">Tidak ada shift aktif</h3>
          <p className="mt-1 text-sm text-fg-muted">Buka shift dari layar Kasir untuk mulai berjualan. Rekap shift terakhir ada di bawah, dan semua shift sebelumnya di tab Riwayat shift.</p>
        </section>
        {lastClosed && <ClosedShiftCard shift={lastClosed} tz={timezone} />}
      </>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <DayStat icon={<UserRound className="size-[18px]" />} label={`Kasir · mulai ${formatDateTime(shift.openedAt, timezone)}`} value={shift.openedByName} />
        <DayStat icon={<TrendingUp className="size-[18px]" />} label="Penjualan shift ini" value={formatRupiah(summary?.netSales ?? 0)} />
      </div>
      <section className="tile p-5">
        <h3 className="font-semibold">Rincian shift</h3>
        {summary ? <SummaryTable summary={summary} openingCash={shift.openingCash} blind={blind} /> : <div className="skeleton mt-3 h-32" />}
      </section>
      <section className="tile p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Kas masuk / keluar</h3>
            <p className="text-sm text-fg-muted">Pengeluaran outlet dan uang yang ditambahkan ke laci di luar penjualan.</p>
          </div>
          <Button size="sm" variant="outline" onClick={onCash}>
            Catat
          </Button>
        </div>
        {!shift.cashMovements.length ? (
          <p className="tile-soft p-3 text-sm text-fg-muted">Belum ada. Contoh: beli es batu, setor uang ke owner, tambah uang kembalian.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shift.cashMovements.map((m) => (
              <li key={m.id} className="tile-soft flex items-center gap-2.5 px-3 py-2.5 text-sm">
                {m.type === 'in' ? <ArrowDownCircle className="size-5 shrink-0 text-success" /> : <ArrowUpCircle className="size-5 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1 truncate">{m.note || (m.type === 'in' ? 'Kas masuk' : 'Kas keluar')}</span>
                <span className={cx('font-semibold tabular', m.type === 'in' ? 'text-success' : 'text-danger')}>
                  {m.type === 'in' ? '+' : '−'}
                  {formatNumber(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DaySummary({ summary: s, blind = false }: { summary: BusinessDaySummary; blind?: boolean }) {
  const row = (label: string, value: number, bold = false) => <div className={cx('flex justify-between gap-3 py-1', bold && 'font-bold')}><span>{label}</span><span className="tabular">{formatNumber(value)}</span></div>;
  return <div className="text-sm">
    {row('Jumlah shift', s.shiftCount)}{row('Transaksi lunas', s.orderCount)}{row('Penjualan kotor', s.grossSales)}
    {row('Diskon', -s.discountTotal)}{row('Service', s.serviceTotal)}{row('Pajak', s.taxTotal)}{row('Total penjualan', s.netSales, true)}
    {blind ? <p className="mt-2 rounded-xl bg-surface-2 p-3 text-fg-muted">Rincian tunai dan kas laci tampil setelah shift ditutup.</p> : <>
    <div className="my-2 border-t border-line" />
    {PAYMENT_METHODS.map((m) => <div key={m}>{row(PAYMENT_LABEL[m], s.byMethod[m])}</div>)}
    {row(`Void (${s.voidCount})`, s.voidAmount)}
    <div className="my-2 border-t border-line" />
    {row('Modal shift pertama', s.openingCash)}{row('Kas masuk seluruh shift', s.cashIn)}{row('Kas keluar seluruh shift', -s.cashOut)}
    {row('Kas seharusnya shift terakhir', s.lastExpectedCash)}
    {s.lastCountedCash !== null && row('Kas dihitung shift terakhir', s.lastCountedCash)}
    {row('Selisih seluruh shift', s.cashDifference, true)}
    <p className="mt-2 text-xs text-fg-muted">Modal pergantian shift tidak dijumlah sebagai pendapatan. Nilai laci berasal dari shift terakhir.</p>
    </>}
  </div>;
}
