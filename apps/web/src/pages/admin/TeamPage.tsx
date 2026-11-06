import { Banknote, CalendarDays, ClipboardCopy, ClipboardPaste, Copy, FileText, Gift, Plus, Printer, Settings2, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import {
  addDaysIso,
  feeOn,
  importDates,
  matchName,
  parseScheduleText,
  weekStartOf,
  formatNumber,
  formatRupiah,
  ROLE_LABEL,
  SCHEDULE_STATUS_LABEL,
  type BonusTier,
  type PersonPayroll,
  type PublicUser,
  type ScheduleStatus,
  type ShiftTemplate,
  type WeekBonus,
} from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { SearchSelect } from '../../components/SearchSelect';
import { WeekNav, WeekSchedule } from '../../components/WeekSchedule';
import { Badge, Button, Card, DeleteButton, Empty, ErrorNote, Field, Modal, MoneyInput, Spinner, TextInput, Toggle, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { currentWeekStart, dayLabel, hours, shiftTone, useWeek, weekLabel } from '../../lib/schedule';
import { PageHeader } from './AdminRoutes';
import { storeTimezone, today, useApi } from './hooks';
import { PillNav } from './PillNav';

type Tab = 'jadwal' | 'gaji' | 'bonus' | 'slip' | 'tarif';
const TABS: { value: Tab; label: string; icon: typeof CalendarDays; hint: string }[] = [
  { value: 'jadwal', label: 'Jadwal', icon: CalendarDays, hint: 'Atur siapa masuk di tiap shift. Karyawan melihatnya di HP dan tablet kasir.' },
  { value: 'gaji', label: 'Gaji & kasbon', icon: Wallet, hint: 'Gaji bulanan = shift masuk × tarif + lembur − kasbon + bonus.' },
  { value: 'bonus', label: 'Bonus tim', icon: Gift, hint: 'Bonus mingguan dari omset, dibagi rata per shift (Team Bonus Program 2026).' },
  { value: 'slip', label: 'Slip gaji', icon: FileText, hint: 'Buat, cetak, salin untuk WhatsApp, atau hapus slip gaji.' },
  { value: 'tarif', label: 'Shift & tarif', icon: Settings2, hint: 'Jam shift, tarif per shift (berlaku mulai tanggal tertentu) dan tarif lembur per jam.' },
];

interface PayrollData {
  month: string;
  templates: ShiftTemplate[];
  weeks: (WeekBonus & { posOmset: number; note: string })[];
  people: PersonPayroll[];
  bonusTiers: BonusTier[];
}

const thisMonth = () => today().slice(0, 7);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function TeamPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'jadwal';
  const current = TABS.find((t) => t.value === tab)!;
  const [month, setMonth] = useState(thisMonth);
  return (
    <div className="p-4">
      <PageHeader title="Jadwal & Gaji" subtitle={current.hint} />
      <PillNav label="Bagian tim" className="mb-4" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={TABS.map(({ value, label, icon: Icon }) => ({ value, label, icon: <Icon className="size-4" /> }))} />
      {tab !== 'jadwal' && tab !== 'tarif' && <MonthPicker value={month} onChange={setMonth} />}
      {tab === 'jadwal' && <ScheduleTab />}
      {tab === 'gaji' && <PayrollTab month={month} />}
      {tab === 'bonus' && <BonusTab month={month} />}
      {tab === 'slip' && <SlipTab month={month} />}
      {tab === 'tarif' && <RatesTab />}
    </div>
  );
}

function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const shift = (n: number) => {
    const [y, m] = value.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    onChange(d.toISOString().slice(0, 7));
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="pill-group">
        <button className="pill" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">‹</button>
        <span className="pill pill-active capitalize">{monthLabel(value)}</span>
        <button className="pill" onClick={() => shift(1)} aria-label="Bulan berikutnya">›</button>
      </div>
      {value !== thisMonth() && (
        <button className="text-sm font-semibold text-primary" onClick={() => onChange(thisMonth())}>
          Bulan ini
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Jadwal

function ScheduleTab() {
  const thisWeek = currentWeekStart(storeTimezone());
  const [week, setWeek] = useState(thisWeek);
  const { data, error, loading, reload } = useWeek(week);
  const staff = useApi<PublicUser[]>('/users');
  const [cell, setCell] = useState<{ date: string; template: ShiftTemplate } | null>(null);
  const [busy, setBusy] = useState(false);
  // Owner boleh ikut dijadwalkan (mis. ikut jaga), tetapi tidak digaji dan tidak dihitung dalam bonus.
  const people = (staff.data ?? []).filter((u) => u.active);
  const [importing, setImporting] = useState(false);

  const copyLastWeek = async () => {
    const ok = await confirmDialog({ title: 'Salin jadwal minggu lalu?', message: `Jadwal ${weekLabel(addDaysIso(week, -7))} disalin ke minggu ini. Yang sudah terisi tidak ditimpa; status izin/sakit kembali Masuk.`, confirmLabel: 'Salin jadwal' });
    if (!ok) return;
    setBusy(true);
    try {
      const { copied } = await api<{ copied: number }>('/schedule/copy-week', { method: 'POST', body: { from: addDaysIso(week, -7), to: week } });
      toast(copied ? `${copied} jadwal disalin` : 'Tidak ada yang perlu disalin');
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-md">
          <WeekNav weekStart={week} thisWeek={thisWeek} onChange={setWeek} />
        </div>
        <Button variant="outline" icon={<Copy className="size-4" />} loading={busy} onClick={() => void copyLastWeek()}>
          Salin dari minggu lalu
        </Button>
        <Button icon={<ClipboardPaste className="size-4" />} disabled={!data || !staff.data} onClick={() => setImporting(true)}>
          Tempel jadwal
        </Button>
        <p className="text-xs text-fg-muted">Ketuk sebuah shift untuk menambah orang atau mencatat izin/sakit.</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && <WeekSchedule data={data} weekStart={week} onCell={(date, template) => setCell({ date, template })} />}
      {importing && data && staff.data && (
        <ImportSchedule
          templates={data.templates.filter((t) => t.active)}
          users={people}
          aliases={(data as WeekWithAliases).aliases ?? {}}
          today={data.today}
          onClose={() => setImporting(false)}
          onDone={(firstWeek) => {
            setImporting(false);
            if (firstWeek) setWeek(firstWeek);
            reload();
          }}
        />
      )}
      {cell && data && (
        <CellEditor
          date={cell.date}
          template={cell.template}
          entries={data.entries.filter((e) => e.date === cell.date && e.templateId === cell.template.id)}
          staff={people}
          overtimeRate={(data as WeekWithAliases).overtimeRate ?? 10000}
          onClose={() => setCell(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

const STATUS_OPTIONS = (Object.keys(SCHEDULE_STATUS_LABEL) as ScheduleStatus[]).map((s) => ({ value: s, label: SCHEDULE_STATUS_LABEL[s] }));

function CellEditor({ date, template, entries, staff, overtimeRate, onClose, onChanged }: { date: string; template: ShiftTemplate; entries: WeekEntry[]; staff: PublicUser[]; overtimeRate: number; onClose: () => void; onChanged: () => void }) {
  const [add, setAdd] = useState('');
  const [busy, setBusy] = useState('');
  const save = async (userId: string, status: ScheduleStatus, note: string, patch?: EntryPatch) => {
    setBusy(userId);
    try {
      await api('/schedule/entries', { method: 'PUT', body: { date, templateId: template.id, userId, status, note, ...patch } });
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };
  const remove = async (id: string) => {
    setBusy(id);
    try {
      await api(`/schedule/entries/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };
  // Orang dengan peran yang cocok dengan shift ini didahulukan di daftar.
  const choices = staff
    .filter((u) => !entries.some((e) => e.userId === u.id))
    .sort((a, b) => Number(b.role === template.role) - Number(a.role === template.role) || a.name.localeCompare(b.name))
    .map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABEL[u.role] }));
  return (
    <Modal open onClose={onClose} title={`${template.name} · ${dayLabel(date)}`}>
      <p className="mb-3 text-sm text-fg-muted">
        {hours(template)} · tarif {formatRupiah(feeOn(template, date))} per shift
      </p>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} template={template} overtimeRate={overtimeRate} busy={busy === e.userId || busy === e.id} onSave={(status, note, patch) => void save(e.userId, status, note, patch)} onRemove={() => void remove(e.id)} />
        ))}
        {!entries.length && <li className="rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">Belum ada yang dijadwalkan.</li>}
      </ul>
      <div className="mt-4 flex gap-2">
        <SearchSelect label="Tambah orang" placeholder="Tambah orang ke shift ini..." value={add} onChange={setAdd} options={choices} className="min-w-0 flex-1" />
        <Button icon={<Plus className="size-5" />} disabled={!add || !!busy} onClick={() => { void save(add, 'masuk', ''); setAdd(''); }}>
          Tambah
        </Button>
      </div>
    </Modal>
  );
}

type WeekEntry = { id: string; userId: string; userName: string; status: ScheduleStatus; note: string; startTime?: string | null; endTime?: string | null; overtimeHours?: number; overtimeRate?: number; overtimeNote?: string };
type WeekWithAliases = { aliases?: Record<string, string>; overtimeRate?: number };
type EntryPatch = { startTime?: string | null; endTime?: string | null; overtimeHours?: number; overtimeNote?: string };

function EntryRow({ entry, template, overtimeRate, busy, onSave, onRemove }: { entry: WeekEntry; template: ShiftTemplate; overtimeRate: number; busy: boolean; onSave: (status: ScheduleStatus, note: string, patch?: EntryPatch) => void; onRemove: () => void }) {
  const [ot, setOt] = useState(entry.overtimeHours ? String(entry.overtimeHours).replace('.', ',') : '');
  const [otNote, setOtNote] = useState(entry.overtimeNote ?? '');
  const otHours = Math.round((parseFloat(ot.replace(',', '.')) || 0) * 4) / 4;
  // Lembur yang sudah tercatat memakai tarif saat dicatat; yang baru memakai tarif sekarang.
  const otRate = entry.overtimeHours && otHours === entry.overtimeHours && entry.overtimeRate ? entry.overtimeRate : overtimeRate;
  const saveOvertime = () => {
    if (otHours === (entry.overtimeHours ?? 0) && otNote === (entry.overtimeNote ?? '')) return;
    onSave(entry.status, note, { overtimeHours: Math.min(12, Math.max(0, otHours)), overtimeNote: otNote });
  };
  const [note, setNote] = useState(entry.note);
  const [start, setStart] = useState(entry.startTime ?? template.startTime);
  const [end, setEnd] = useState(entry.endTime ?? template.endTime);
  const saveTimes = (s: string, e: string) => onSave(entry.status, note, { startTime: s && s !== template.startTime ? s : null, endTime: e && e !== template.endTime ? e : null });
  return (
    <li className={cx('flex flex-col gap-2 rounded-2xl border p-3', entry.status === 'masuk' ? 'border-line' : 'border-danger/30 bg-danger/5')}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{entry.userName}</span>
        <SearchSelect label={`Status ${entry.userName}`} className="max-w-40 shrink-0" value={entry.status} onChange={(s) => onSave(s, note)} options={STATUS_OPTIONS} disabled={busy} />
        <button aria-label={`Hapus ${entry.userName} dari shift`} onClick={onRemove} disabled={busy} className="grid size-11 place-items-center rounded-xl text-fg-subtle hover:bg-danger/10 hover:text-danger">
          <Trash2 className="size-4" />
        </button>
      </div>
      {entry.status === 'masuk' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Jam</span>
          <input type="time" aria-label={`Jam mulai ${entry.userName}`} className={cx(inputClass, 'h-10 max-w-32 shrink-0 text-sm')} value={start} onChange={(e) => setStart(e.target.value)} onBlur={() => saveTimes(start, end)} />
          <span>–</span>
          <input type="time" aria-label={`Jam selesai ${entry.userName}`} className={cx(inputClass, 'h-10 max-w-32 shrink-0 text-sm')} value={end} onChange={(e) => setEnd(e.target.value)} onBlur={() => saveTimes(start, end)} />
          {(entry.startTime || entry.endTime) && <span className="text-xs text-primary">jam khusus</span>}
        </div>
      )}
      {entry.status === 'masuk' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">Lembur</span>
          <input
            inputMode="decimal"
            aria-label={`Jam lembur ${entry.userName}`}
            placeholder="0"
            className={cx(inputClass, 'h-10 max-w-20 shrink-0 text-right text-sm')}
            value={ot}
            onChange={(e) => setOt(e.target.value.replace(/[^\d,.]/g, ''))}
            onBlur={saveOvertime}
          />
          <span className="text-fg-muted">jam</span>
          {otHours > 0 && (
            <>
              <span className="font-semibold text-[var(--violet)] tabular">= {formatRupiah(Math.round(otHours * otRate))}</span>
              <input className={cx(inputClass, 'h-10 min-w-40 flex-1 basis-40 text-sm')} placeholder="Keterangan (mis. sampai 18:00)" maxLength={200} value={otNote} onChange={(e) => setOtNote(e.target.value)} onBlur={saveOvertime} />
            </>
          )}
        </div>
      )}
      {entry.status !== 'masuk' && (
        <input
          className={cx(inputClass, 'h-10 text-sm')}
          placeholder="Keterangan (mis. demam, acara keluarga)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== entry.note && onSave(entry.status, note)}
        />
      )}
    </li>
  );
}

// ------------------------------------------------------------------ Gaji & kasbon

function PayrollTab({ month }: { month: string }) {
  const { data, error, loading, reload } = useApi<PayrollData>(`/payroll?month=${month}`);
  const staff = useApi<PublicUser[]>('/users');
  const [open, setOpen] = useState<string | null>(null);
  const [kasbonFor, setKasbonFor] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const totals = useMemo(() => {
    const p = data?.people ?? [];
    return { gross: sum(p.map((x) => x.gross)), overtime: sum(p.map((x) => x.overtimeTotal ?? 0)), kasbon: sum(p.map((x) => x.kasbonTotal)), bonus: sum(p.map((x) => x.bonusTotal)), takeHome: sum(p.map((x) => x.takeHome)) };
  }, [data]);

  const generate = async (userIds?: string[]) => {
    setBusy(userIds?.[0] ?? 'all');
    try {
      const { created } = await api<{ created: number }>('/payslips', { method: 'POST', body: { month, userIds } });
      toast(`${created} slip gaji dibuat. Lihat di tab Slip gaji.`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Gaji shift" value={totals.gross} />
            <Stat label="Lembur" value={totals.overtime} tone="text-[var(--violet)]" />
            <Stat label="Kasbon" value={-totals.kasbon} tone="text-danger" />
            <Stat label="Bonus tim" value={totals.bonus} tone="text-success" />
            <Stat label="Total dibayar" value={totals.takeHome} strong />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Banknote className="size-5" />} variant="outline" onClick={() => setKasbonFor('')}>
              Catat kasbon
            </Button>
            <Button icon={<FileText className="size-5" />} loading={busy === 'all'} disabled={!data.people.length} onClick={() => void generate()}>
              Buat slip gaji semua
            </Button>
          </div>
          {!data.people.length && (
            <div className="tile">
              <Empty title={`Belum ada shift, kasbon, atau bonus di ${monthLabel(month)}`}>
                <p className="text-sm">Isi jadwal di tab Jadwal; gaji dihitung dari shift berstatus Masuk.</p>
              </Empty>
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {data.people.map((p, i) => (
              <li key={p.userId} className="tile animate-rise overflow-hidden" style={{ animationDelay: `${i * 30}ms` }}>
                <button onClick={() => setOpen(open === p.userId ? null : p.userId)} className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 p-4 text-left">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 font-bold text-primary">{p.name.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-36 flex-1">
                    <span className="block font-bold">{p.name}</span>
                    <span className="text-sm text-fg-muted">
                      {ROLE_LABEL[p.role as PublicUser['role']] ?? p.role} · {p.shifts.length} shift{p.absences.length ? ` · ${p.absences.length} tidak masuk` : ''}
                    </span>
                  </span>
                  <Money label="Gaji" value={p.gross} />
                  <Money label="Lembur" value={p.overtimeTotal ?? 0} tone="text-[var(--violet)]" />
                  <Money label="Kasbon" value={-p.kasbonTotal} tone="text-danger" />
                  <Money label="Bonus" value={p.bonusTotal} tone="text-success" />
                  <Money label="Diterima" value={p.takeHome} strong />
                </button>
                {open === p.userId && (
                  <div className="animate-fade-in grid gap-4 border-t border-line bg-surface-2/50 p-4 lg:grid-cols-2 xl:grid-cols-4">
                    <Breakdown title="Shift" empty="Belum ada shift masuk">
                      {groupShifts(p).map((g) => (
                        <Line key={g.key} label={`${g.name} × ${g.count}`} hint={`@ ${formatRupiah(g.fee)}`} value={g.count * g.fee} />
                      ))}
                      {p.absences.map((a) => (
                        <p key={`${a.date}${a.templateName}`} className="text-xs text-danger">
                          {dayLabel(a.date, 'short')} {a.templateName}: {SCHEDULE_STATUS_LABEL[a.status]}
                          {a.note && ` (${a.note})`}
                        </p>
                      ))}
                    </Breakdown>
                    <Breakdown title="Lembur" empty="Tidak ada lembur">
                      {(p.overtime ?? []).map((o) => (
                        <Line key={`${o.date}${o.templateName}`} label={`${dayLabel(o.date, 'short')} · ${String(o.hours).replace('.', ',')} jam`} hint={`@ ${formatRupiah(o.rate)}${o.note ? ` · ${o.note}` : ''}`} value={o.amount} />
                      ))}
                    </Breakdown>
                    <Breakdown title="Kasbon" empty="Tidak ada kasbon" action={<Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setKasbonFor(p.userId)}>Kasbon</Button>}>
                      {p.kasbon.map((k) => (
                        <KasbonLine key={k.id} kasbon={k} onDeleted={reload} />
                      ))}
                    </Breakdown>
                    <Breakdown title="Bonus mingguan" empty="Belum ada bonus">
                      {p.bonuses.map((b) => (
                        <Line key={b.weekStart} label={weekLabel(b.weekStart)} hint={b.disqualified ? 'tidak memenuhi syarat' : `${b.shifts} shift`} value={b.bonus} />
                      ))}
                    </Breakdown>
                    <div className="flex justify-end lg:col-span-2 xl:col-span-4">
                      <Button variant="outline" icon={<FileText className="size-4" />} loading={busy === p.userId} onClick={() => void generate([p.userId])}>
                        Buat slip gaji {p.name}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {kasbonFor !== null && (
        <KasbonForm
          staff={(staff.data ?? []).filter((u) => u.active && u.role !== 'owner')}
          userId={kasbonFor}
          month={month}
          onClose={() => setKasbonFor(null)}
          onSaved={() => {
            setKasbonFor(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function groupShifts(p: PersonPayroll) {
  const map = new Map<string, { key: string; name: string; fee: number; count: number }>();
  for (const s of p.shifts) {
    const key = `${s.templateId}|${s.fee}`;
    const g = map.get(key) ?? { key, name: s.templateName, fee: s.fee, count: 0 };
    g.count++;
    map.set(key, g);
  }
  return [...map.values()];
}

function KasbonLine({ kasbon, onDeleted }: { kasbon: { id: string; date: string; amount: number; note: string }; onDeleted: () => void }) {
  const remove = async () => {
    const ok = await confirmDialog({ title: 'Hapus kasbon?', message: `${formatRupiah(kasbon.amount)} tanggal ${dayLabel(kasbon.date, 'short')}${kasbon.note ? ` (${kasbon.note})` : ''} dihapus dari potongan gaji.`, confirmLabel: 'Hapus', danger: true });
    if (!ok) return;
    try {
      await api(`/kasbon/${kasbon.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-semibold tabular">{dayLabel(kasbon.date, 'short')}</span>
        {kasbon.note && <span className="text-fg-muted"> · {kasbon.note}</span>}
      </span>
      <span className="font-semibold text-danger tabular">−{formatNumber(kasbon.amount)}</span>
      <button aria-label="Hapus kasbon" onClick={() => void remove()} className="grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-danger/10 hover:text-danger">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function KasbonForm({ staff, userId, month, onClose, onSaved }: { staff: PublicUser[]; userId: string; month: string; onClose: () => void; onSaved: () => void }) {
  const [who, setWho] = useState(userId);
  const defaultDate = today().startsWith(month) ? today() : `${month}-01`;
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/kasbon', { method: 'POST', body: { userId: who, date, amount, note } });
      toast('Kasbon dicatat');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal open size="sm" onClose={onClose} title="Catat kasbon" footer={<Button className="flex-1" size="lg" loading={busy} disabled={!who || amount <= 0 || !date} onClick={() => void save()}>Simpan kasbon</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Karyawan">{(id) => <SearchSelect id={id} label="Karyawan" placeholder="Pilih karyawan..." value={who} onChange={setWho} options={staff.map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABEL[u.role] }))} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Jumlah">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        </div>
        <Field label="Keterangan (opsional)">{(id) => <TextInput id={id} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}</Field>
        <p className="text-xs text-fg-muted">Kasbon dipotong dari gaji bulan sesuai tanggalnya. Bisa dicatat berkali-kali.</p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Bonus

function BonusTab({ month }: { month: string }) {
  const { data, error, loading, reload } = useApi<PayrollData>(`/payroll?month=${month}`);
  const names = useMemo(() => new Map((data?.people ?? []).map((p) => [p.userId, p.name])), [data]);
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">
              Bonus minggu Senin–Minggu dibayar bersama gaji bulan tempat hari Minggu-nya jatuh. Omset = Penjualan Bersih di POS (setelah diskon, tanpa service & pajak); bisa ditimpa manual bila ada penjualan di luar POS.
            </p>
            {data.weeks.map((w) => (
              <WeekBonusCard key={w.weekStart} week={w} names={names} onSaved={reload} />
            ))}
            {!data.weeks.length && <Empty title="Tidak ada minggu bonus di bulan ini" />}
          </div>
          <div className="flex flex-col gap-4 xl:sticky xl:top-4">
            <TiersCard tiers={data.bonusTiers} onSaved={reload} />
            <Card title="Syarat bonus">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
                <li>Tidak ada selisih kas yang tidak dapat dipertanggungjawabkan.</li>
                <li>Menjalankan SOP operasional dan kebersihan.</li>
                <li>Tidak ada pelanggaran disiplin berat.</li>
                <li>Menjaga pelayanan dan kerja sama tim.</li>
              </ul>
              <p className="mt-2 text-xs text-fg-subtle">Matikan "Memenuhi syarat" untuk orang yang tidak lolos; bagiannya hangus, bagian orang lain tidak berubah.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekBonusCard({ week, names, onSaved }: { week: PayrollData['weeks'][number]; names: Map<string, string>; onSaved: () => void }) {
  const [manual, setManual] = useState(week.omsetSource === 'manual');
  const [omset, setOmset] = useState(week.omsetSource === 'manual' ? week.omset : week.posOmset);
  const [dq, setDq] = useState<string[]>(Object.entries(week.people).filter(([, p]) => p.disqualified).map(([id]) => id));
  const [busy, setBusy] = useState(false);
  const dirty = manual !== (week.omsetSource === 'manual') || (manual && omset !== week.omset) || dq.sort().join() !== Object.entries(week.people).filter(([, p]) => p.disqualified).map(([id]) => id).sort().join();
  const save = async () => {
    setBusy(true);
    try {
      await api(`/bonus-weeks/${week.weekStart}`, { method: 'PUT', body: { omsetOverride: manual ? omset : null, disqualified: dq, note: week.note } });
      toast('Bonus minggu ini diperbarui');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tile animate-rise p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{weekLabel(week.weekStart)}</h3>
          <p className="text-sm text-fg-muted">
            Omset POS {formatRupiah(week.posOmset)} · {week.totalShifts} shift
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-fg-muted">Bonus tim</p>
          <p className={cx('text-2xl font-extrabold tabular', week.teamBonus ? 'text-success' : 'text-fg-subtle')}>{formatRupiah(week.teamBonus)}</p>
          <p className="text-xs text-fg-muted">{week.totalShifts ? `${formatRupiah(week.perShift)} per shift` : 'belum ada shift'}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Toggle checked={manual} onChange={setManual} label="Pakai omset manual" />
        {manual && (
          <div className="w-52">
            <MoneyInput aria-label="Omset manual" value={omset} onChange={setOmset} />
          </div>
        )}
      </div>
      {Object.keys(week.people).length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {Object.entries(week.people).map(([id, p]) => (
            <li key={id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-semibold">{names.get(id) ?? 'Karyawan'}</span>
              <span className="text-fg-muted tabular">{p.shifts} shift</span>
              <span className={cx('w-24 text-right font-semibold tabular', p.disqualified ? 'text-fg-subtle line-through' : 'text-success')}>{formatRupiah(p.bonus)}</span>
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!dq.includes(id)} onChange={(e) => setDq((cur) => (e.target.checked ? cur.filter((x) => x !== id) : [...cur, id]))} />
                Memenuhi syarat
              </label>
            </li>
          ))}
        </ul>
      )}
      {dirty && (
        <div className="mt-3 flex justify-end">
          <Button loading={busy} onClick={() => void save()}>
            Simpan & hitung ulang
          </Button>
        </div>
      )}
    </section>
  );
}

function TiersCard({ tiers, onSaved }: { tiers: BonusTier[]; onSaved: () => void }) {
  const [rows, setRows] = useState(tiers);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(tiers);
  const save = async () => {
    setBusy(true);
    try {
      await api('/payroll/settings', { method: 'PUT', body: { bonusTiers: rows.filter((r) => r.min > 0) } });
      toast('Target bonus disimpan');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Target bonus mingguan" icon={<Gift className="size-4" />}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-semibold text-fg-muted">
          <span>Omset minimal</span>
          <span>Bonus tim</span>
          <span className="w-9" />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <MoneyInput aria-label={`Omset minimal ${i + 1}`} value={r.min} onChange={(n) => setRows(rows.map((x, j) => (j === i ? { ...x, min: n } : x)))} />
            <MoneyInput aria-label={`Bonus ${i + 1}`} value={r.bonus} onChange={(n) => setRows(rows.map((x, j) => (j === i ? { ...x, bonus: n } : x)))} />
            <button aria-label="Hapus tingkat" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-danger/10 hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, { min: 0, bonus: 0 }])}>
          Tambah tingkat
        </Button>
        <p className="text-xs text-fg-subtle">Di bawah tingkat terendah tidak ada bonus.</p>
        {dirty && (
          <Button loading={busy} onClick={() => void save()}>
            Simpan target
          </Button>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ Slip gaji

interface SlipRow {
  id: string;
  userId: string;
  name: string;
  takeHome: number;
  createdAt: string;
}
interface SlipData extends PersonPayroll {
  month: string;
  storeName: string;
  storeAddress: string;
  weeks: Omit<WeekBonus, 'people'>[];
  generatedAt: string;
}

function SlipTab({ month }: { month: string }) {
  const { data, error, loading, reload } = useApi<SlipRow[]>(`/payslips?month=${month}`);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generateAll = async () => {
    setBusy(true);
    try {
      const { created } = await api<{ created: number }>('/payslips', { method: 'POST', body: { month } });
      toast(`${created} slip gaji dibuat`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<FileText className="size-5" />} loading={busy} onClick={() => void generateAll()}>
          {data?.length ? 'Buat ulang semua dari data terbaru' : 'Buat slip gaji semua'}
        </Button>
        <p className="text-xs text-fg-muted">Slip menyimpan angka saat dibuat. Ubah jadwal/kasbon/bonus lalu buat ulang bila perlu.</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && !data.length && (
        <div className="tile">
          <Empty title={`Belum ada slip gaji ${monthLabel(month)}`} />
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((s, i) => (
          <li key={s.id}>
            <button onClick={() => setOpen(s.id)} className="tile animate-rise flex w-full items-center gap-3 p-4 text-left transition-shadow hover:ring-2 hover:ring-primary/20" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--lime)] text-[var(--lime-ink)]">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{s.name}</span>
                <span className="text-xs text-fg-muted capitalize">{monthLabel(month)}</span>
              </span>
              <span className="text-lg font-extrabold tabular">{formatRupiah(s.takeHome)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <SlipModal id={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function SlipModal({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const { data } = useApi<{ id: string; data: SlipData }>(`/payslips/${id}`);
  const slip = data?.data;
  const remove = async () => {
    const ok = await confirmDialog({ title: 'Hapus slip gaji?', message: 'Slip ini dihapus. Data jadwal, kasbon, dan bonus tidak berubah; slip bisa dibuat lagi kapan saja.', confirmLabel: 'Hapus slip', danger: true });
    if (!ok) return;
    try {
      await api(`/payslips/${id}`, { method: 'DELETE' });
      toast('Slip gaji dihapus');
      onDeleted();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const copy = async () => {
    if (!slip) return;
    try {
      await navigator.clipboard.writeText(slipText(slip));
      toast('Teks slip disalin. Tempel di WhatsApp.');
    } catch {
      toast('Tidak bisa menyalin di perangkat ini', 'error');
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Slip gaji"
      footer={
        <>
          <DeleteButton onClick={() => void remove()} />
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            <Button variant="outline" icon={<ClipboardCopy className="size-5" />} disabled={!slip} onClick={() => void copy()}>
              Salin untuk WhatsApp
            </Button>
            <Button icon={<Printer className="size-5" />} disabled={!slip} onClick={() => printSlip(slip!)}>
              Cetak / Simpan PDF
            </Button>
          </div>
        </>
      }
    >
      {!slip ? <Spinner className="mx-auto my-8" /> : <Payslip slip={slip} />}
      {slip &&
        createPortal(
          <div className="print-root">
            <Payslip slip={slip} />
          </div>,
          document.body,
        )}
    </Modal>
  );
}

/** Nama berkas PDF mengikuti judul halaman saat mencetak: "Slip gaji Restu November 2026". */
function printSlip(slip: SlipData) {
  const prev = document.title;
  document.title = `Slip gaji ${slip.name} ${monthLabel(slip.month)}`;
  const restore = () => {
    document.title = prev;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

function Payslip({ slip }: { slip: SlipData }) {
  const tz = storeTimezone();
  return (
    <article className="print-area mx-auto max-w-xl rounded-2xl border border-line bg-white p-6 text-[#101513]">
      <header className="flex items-start justify-between gap-4 border-b border-dashed border-[#c8d2ca] pb-4">
        <div>
          <p className="text-lg font-extrabold">{slip.storeName}</p>
          {slip.storeAddress && <p className="text-xs text-[#55605a]">{slip.storeAddress}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold tracking-widest text-[#55605a] uppercase">Slip gaji</p>
          <p className="font-semibold capitalize">{monthLabel(slip.month)}</p>
        </div>
      </header>
      <p className="mt-4 text-sm">
        <span className="text-[#55605a]">Nama: </span>
        <b>{slip.name}</b> · {ROLE_LABEL[slip.role as PublicUser['role']] ?? slip.role}
      </p>
      <SlipSection title="Gaji shift">
        {groupShifts(slip).map((g) => (
          <SlipLine key={g.key} label={`${g.name} × ${g.count} shift`} hint={`@ ${formatRupiah(g.fee)}`} value={g.count * g.fee} />
        ))}
        <SlipLine label="Jumlah gaji shift" value={slip.gross} strong />
      </SlipSection>
      {(slip.overtime ?? []).length > 0 && (
        <SlipSection title="Lembur">
          {slip.overtime.map((o) => (
            <SlipLine key={`${o.date}${o.templateName}`} label={`${dayLabel(o.date, 'short')} · ${String(o.hours).replace('.', ',')} jam`} hint={`@ ${formatRupiah(o.rate)}/jam${o.note ? ` · ${o.note}` : ''}`} value={o.amount} />
          ))}
        </SlipSection>
      )}
      {slip.bonuses.length > 0 && (
        <SlipSection title="Bonus tim">
          {slip.bonuses.map((b) => (
            <SlipLine key={b.weekStart} label={`Minggu ${weekLabel(b.weekStart)}`} hint={b.disqualified ? 'tidak memenuhi syarat' : `${b.shifts} shift`} value={b.bonus} />
          ))}
        </SlipSection>
      )}
      {slip.kasbon.length > 0 && (
        <SlipSection title="Potongan kasbon">
          {slip.kasbon.map((k) => (
            <SlipLine key={k.id} label={`${dayLabel(k.date, 'short')}${k.note ? ` · ${k.note}` : ''}`} value={-k.amount} />
          ))}
        </SlipSection>
      )}
      <div className="mt-4 flex items-center justify-between rounded-xl bg-[#ecf9d4] px-4 py-3">
        <span className="font-bold">Total diterima</span>
        <span className="text-xl font-extrabold tabular">{formatRupiah(slip.takeHome)}</span>
      </div>
      {slip.absences.length > 0 && (
        <p className="mt-3 text-xs text-[#55605a]">
          Tidak masuk: {slip.absences.map((a) => `${dayLabel(a.date, 'short')} (${SCHEDULE_STATUS_LABEL[a.status]})`).join(', ')}
        </p>
      )}
      <footer className="mt-8 grid grid-cols-2 gap-6 text-center text-xs text-[#55605a]">
        <div>
          <p>Diterima oleh</p>
          <p className="mt-12 border-t border-[#c8d2ca] pt-1 font-semibold text-[#101513]">{slip.name}</p>
        </div>
        <div>
          <p>Owner</p>
          <p className="mt-12 border-t border-[#c8d2ca] pt-1">&nbsp;</p>
        </div>
      </footer>
      <p className="mt-4 text-center text-[10px] text-[#66716b]">Dibuat {new Date(slip.generatedAt).toLocaleString('id-ID', { timeZone: tz })}</p>
    </article>
  );
}

function SlipSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <p className="mb-1 text-xs font-bold tracking-wide text-[#55605a] uppercase">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function SlipLine({ label, hint, value, strong }: { label: string; hint?: string; value: number; strong?: boolean }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 text-sm', strong && 'border-t border-[#e3e9e4] pt-1 font-bold')}>
      <span>
        {label} {hint && <span className="text-xs text-[#66716b]">{hint}</span>}
      </span>
      <span className="tabular">{value < 0 ? `−${formatNumber(-value)}` : formatNumber(value)}</span>
    </div>
  );
}

function slipText(s: SlipData): string {
  const lines = [`*Slip gaji ${s.storeName}*`, `${monthLabel(s.month)} · ${s.name}`, ''];
  for (const g of groupShifts(s)) lines.push(`${g.name} × ${g.count} @ ${formatRupiah(g.fee)} = ${formatRupiah(g.count * g.fee)}`);
  lines.push(`Gaji shift: ${formatRupiah(s.gross)}`);
  if (s.overtimeTotal) lines.push(`Lembur: +${formatRupiah(s.overtimeTotal)} (${(s.overtime ?? []).map((o) => `${String(o.hours).replace('.', ',')} jam`).join(', ')})`);
  if (s.bonusTotal) lines.push(`Bonus tim: +${formatRupiah(s.bonusTotal)}`);
  if (s.kasbonTotal) lines.push(`Kasbon: −${formatRupiah(s.kasbonTotal)}`);
  lines.push('', `*Total diterima: ${formatRupiah(s.takeHome)}*`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ Shift & tarif

function OvertimeRateCard({ rate, onSaved }: { rate: number; onSaved: () => void }) {
  const [value, setValue] = useState(rate);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/payroll/settings', { method: 'PUT', body: { overtimeRate: value } });
      toast('Tarif lembur disimpan');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tile animate-rise flex flex-col gap-3 p-4">
      <p className="flex items-center gap-2 font-bold">
        <span className="size-2.5 rounded-full bg-[var(--violet)]" /> Lembur
      </p>
      <div className="rounded-2xl bg-[var(--violet-soft)] p-3">
        <p className="text-xs font-semibold text-[var(--violet)]">Tarif lembur per jam</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="w-40">
            <MoneyInput aria-label="Tarif lembur per jam" value={value} onChange={setValue} />
          </div>
          {value !== rate && (
            <Button size="sm" loading={busy} onClick={() => void save()}>
              Simpan
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-fg-muted">Catat jam lembur di Jadwal (ketuk shift orangnya). Tarif berlaku untuk lembur yang dicatat setelah diubah; lembur yang sudah tercatat tetap memakai tarif lamanya.</p>
    </section>
  );
}

function RatesTab() {
  const day = today();
  const { data, error, loading, reload } = useApi<{ templates: ShiftTemplate[]; overtimeRate?: number }>(`/schedule?from=${day}&to=${day}`);
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>
          Tambah shift
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data && <OvertimeRateCard key={data.overtimeRate} rate={data.overtimeRate ?? 10000} onSaved={reload} />}
        {data?.templates.map((t, i) => {
          const tone = shiftTone(i);
          const current = feeOn(t, day);
          const upcoming = t.rates.filter((r) => r.effectiveFrom > day);
          return (
            <section key={t.id} className={cx('tile animate-rise flex flex-col gap-3 p-4', !t.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-bold">
                    <span className="size-2.5 rounded-full" style={{ background: tone.dot }} />
                    {t.name} {!t.active && <Badge>Nonaktif</Badge>}
                  </p>
                  <p className="text-sm text-fg-muted tabular">
                    {hours(t)}
                    {t.role && ` · ${ROLE_LABEL[t.role]}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  Ubah
                </Button>
              </div>
              <div className="rounded-2xl p-3" style={{ background: tone.bg }}>
                <p className="text-xs font-semibold" style={{ color: tone.fg }}>
                  Tarif per shift saat ini
                </p>
                <p className="text-2xl font-extrabold tabular" style={{ color: tone.fg }}>
                  {formatRupiah(current)}
                </p>
                {upcoming.map((r) => (
                  <p key={r.effectiveFrom} className="text-xs" style={{ color: tone.fg }}>
                    Menjadi {formatRupiah(r.fee)} mulai {dayLabel(r.effectiveFrom, 'short')}
                  </p>
                ))}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-fg-muted">Riwayat tarif ({t.rates.length})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {[...t.rates].reverse().map((r) => (
                    <li key={r.effectiveFrom} className="flex justify-between tabular">
                      <span>mulai {dayLabel(r.effectiveFrom, 'short')} {r.effectiveFrom.slice(0, 4)}</span>
                      <span className="font-semibold">{formatRupiah(r.fee)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })}
      </div>
      {editing && <TemplateForm template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: '', label: 'Semua peran' },
  { value: 'barista', label: 'Barista' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'kasir', label: 'Kasir' },
];

function TemplateForm({ template, onClose, onSaved }: { template: ShiftTemplate | null; onClose: () => void; onSaved: () => void }) {
  const day = today();
  const [name, setName] = useState(template?.name ?? '');
  const [start, setStart] = useState(template?.startTime ?? '09:00');
  const [end, setEnd] = useState(template?.endTime ?? '17:00');
  const [role, setRole] = useState<string>(template?.role ?? '');
  const [active, setActive] = useState(template?.active ?? true);
  const [fee, setFee] = useState(template ? feeOn(template, day) : 0);
  const [from, setFrom] = useState(day);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const feeChanged = !template || fee !== feeOn(template, from);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { name, startTime: start, endTime: end, role: role || null, active };
      if (template) {
        await api(`/shift-templates/${template.id}`, { method: 'PATCH', body });
        if (feeChanged) await api(`/shift-templates/${template.id}/rates`, { method: 'POST', body: { fee, effectiveFrom: from } });
      } else {
        await api('/shift-templates', { method: 'POST', body: { ...body, fee, effectiveFrom: from } });
      }
      toast('Shift disimpan');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!template) return;
    const ok = await confirmDialog({ title: `Hapus ${template.name}?`, message: 'Shift hilang dari jadwal berikutnya. Jadwal dan gaji yang sudah memakai shift ini tetap utuh.', confirmLabel: 'Hapus shift', danger: true });
    if (!ok) return;
    try {
      await api(`/shift-templates/${template.id}`, { method: 'DELETE' });
      toast('Shift dihapus');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={template ? `Ubah ${template.name}` : 'Shift baru'}
      footer={
        <>
          {template && <DeleteButton disabled={busy} onClick={() => void remove()} />}
          <Button className="flex-1" size="lg" loading={busy} disabled={!name.trim()} onClick={() => void save()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nama shift">{(id) => <TextInput id={id} value={name} maxLength={40} placeholder="Shift 1" onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai">{(id) => <TextInput id={id} type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />}</Field>
          <Field label="Selesai">{(id) => <TextInput id={id} type="time" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />}</Field>
        </div>
        <Field label="Biasanya diisi" hint="Hanya untuk mengurutkan pilihan orang di jadwal.">
          {(id) => <SearchSelect id={id} label="Peran" value={role} onChange={setRole} options={ROLE_OPTIONS} />}
        </Field>
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-3">
          <Field label="Tarif per shift">{(id) => <MoneyInput id={id} value={fee} onChange={setFee} />}</Field>
          <Field label="Berlaku mulai" hint="Shift sebelum tanggal ini tetap tarif lama.">
            {(id) => <TextInput id={id} type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />}
          </Field>
        </div>
        {template && <Toggle checked={active} onChange={setActive} label="Aktif" description="Shift nonaktif tidak muncul di jadwal minggu berikutnya." />}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ kecil-kecil

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function Stat({ label, value, tone, strong }: { label: string; value: number; tone?: string; strong?: boolean }) {
  return (
    <div className={cx('tile animate-rise p-4', strong && 'text-white')} style={strong ? { background: 'linear-gradient(135deg, #252d29, var(--ink))' } : undefined}>
      <p className={cx('text-sm', strong ? 'text-white/70' : 'text-fg-muted')}>{label}</p>
      <p className={cx('mt-1 text-2xl font-extrabold tracking-tight tabular', !strong && tone)}>{value < 0 ? `−${formatRupiah(-value)}` : formatRupiah(value)}</p>
    </div>
  );
}

function Money({ label, value, tone, strong }: { label: string; value: number; tone?: string; strong?: boolean }) {
  return (
    <span className="min-w-24 text-right">
      <span className="block text-[11px] text-fg-muted">{label}</span>
      <span className={cx('font-bold tabular', strong ? 'text-lg' : '', tone)}>{value < 0 ? `−${formatNumber(-value)}` : formatNumber(value)}</span>
    </span>
  );
}

function Breakdown({ title, empty, action, children }: { title: string; empty: string; action?: React.ReactNode; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.flat().some(Boolean) : !!children;
  return (
    <section className="rounded-2xl bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{has ? children : <p className="text-sm text-fg-subtle">{empty}</p>}</div>
    </section>
  );
}

function Line({ label, hint, value }: { label: string; hint?: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span>
        {label} {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </span>
      <span className="font-semibold tabular">{formatNumber(value)}</span>
    </div>
  );
}

// ------------------------------------------------------------------ Tempel jadwal

const SAMPLE = `JADWAL SHIFT BARISTA
2 November - 8 November 2026

Senin
- Shift 1 (9:00-16:00) | ntu
- Shift 2 (15:00-22:00) | dapa
- Kitchen (14:00-20:30) | ila`;
const SKIP = '__lewati';

/**
 * Tempel jadwal dari teks WhatsApp: dibaca otomatis, nama panggilan dicocokkan ke akun (diingat untuk minggu
 * berikutnya), bisa diulang tiap minggu sampai akhir bulan. Owner melihat pratinjau sebelum menerapkan.
 */
function ImportSchedule({ templates, users, aliases, today, onClose, onDone }: { templates: ShiftTemplate[]; users: PublicUser[]; aliases: Record<string, string>; today: string; onClose: () => void; onDone: (firstWeek: string | null) => void }) {
  const [text, setText] = useState('');
  const [weekInput, setWeekInput] = useState('');
  const [repeat, setRepeat] = useState(true);
  const [replace, setReplace] = useState(true);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsed = useMemo(() => (text.trim() ? parseScheduleText(text, templates) : null), [text, templates]);
  const weekStart = weekInput ? weekStartOf(weekInput) : (parsed?.weekStart ?? weekStartOf(today));
  const names = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of parsed?.rows ?? []) for (const n of r.names) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
    return [...seen.entries()];
  }, [parsed]);
  const auto = (key: string, display: string) => matchName(display, users, aliases);
  const resolve = (key: string, display: string) => picked[key] ?? auto(key, display) ?? '';
  const unresolved = names.filter(([k, d]) => !resolve(k, d));

  const plan = useMemo(() => {
    const entries: { date: string; templateId: string; userId: string; startTime: string | null; endTime: string | null }[] = [];
    const dates = new Set<string>();
    for (const r of parsed?.rows ?? []) {
      for (const date of importDates(weekStart, r.day, repeat)) {
        dates.add(date);
        for (const n of r.names) {
          const id = resolve(n.toLowerCase(), n);
          if (id && id !== SKIP) entries.push({ date, templateId: r.templateId, userId: id, startTime: r.startTime, endTime: r.endTime });
        }
      }
    }
    return { entries, dates: [...dates].sort() };
    // resolve bergantung pada picked/aliases/users.
  }, [parsed, weekStart, repeat, picked, aliases, users]);

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const learned = Object.fromEntries(names.map(([k, d]) => [k, resolve(k, d)]).filter(([, id]) => id && id !== SKIP));
      await api('/schedule/import', { method: 'POST', body: { entries: plan.entries, replaceDates: replace ? plan.dates : [], aliases: learned } });
      toast(`${plan.entries.length} jadwal diterapkan`);
      onDone(weekStart);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const userOptions = [...users.map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABEL[u.role] })), { value: SKIP, label: 'Lewati nama ini' }];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '';
  const firstRange = plan.dates.length ? `${dayLabel(plan.dates[0], 'short')} – ${dayLabel(plan.dates[plan.dates.length - 1], 'short')}` : '';

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      dismissable={!busy}
      title="Tempel jadwal"
      footer={
        <>
          <p className="flex-1 self-center text-sm text-fg-muted">
            {plan.entries.length ? `${plan.entries.length} jadwal di ${plan.dates.length} hari (${firstRange})` : 'Tempel teks jadwal untuk melihat pratinjau'}
          </p>
          <Button size="lg" loading={busy} disabled={!plan.entries.length || unresolved.length > 0} onClick={() => void apply()}>
            Terapkan jadwal
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="jadwal-teks" className="text-sm font-semibold text-fg-muted">
            Teks jadwal (salin dari WhatsApp)
          </label>
          <textarea
            id="jadwal-teks"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
            className="min-h-80 w-full rounded-2xl border border-line bg-surface-2 p-3 font-mono text-sm leading-relaxed outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <p className="text-xs text-fg-subtle">Nama hari (Senin–Minggu) di baris sendiri, lalu satu baris per shift berisi nama shift, jam (opsional), dan nama orang. Beberapa orang dipisah koma.</p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!parsed ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">Pratinjau muncul di sini setelah teks ditempel.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minggu (Senin)" hint={parsed.weekStart ? 'Terbaca dari teks' : 'Tanggal tidak ditemukan di teks'}>
                  {(id) => <TextInput id={id} type="date" value={weekInput || weekStart} onChange={(e) => setWeekInput(e.target.value)} />}
                </Field>
                <div className="flex flex-col justify-end gap-1">
                  <Toggle checked={repeat} onChange={setRepeat} label="Ulangi sampai akhir bulan" />
                  <Toggle checked={replace} onChange={setReplace} label="Ganti jadwal lama di tanggal itu" />
                </div>
              </div>

              {names.length > 0 && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-fg-muted">Cocokkan nama ({names.length - unresolved.length}/{names.length})</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {names.map(([key, display]) => {
                      const id = resolve(key, display);
                      const isAuto = !picked[key] && !!auto(key, display);
                      return (
                        <li key={key} className={cx('flex items-center gap-2 rounded-xl border p-2', id ? 'border-line' : 'border-warning/50 bg-warning/8')}>
                          <span className="w-16 shrink-0 truncate font-mono text-sm font-semibold">{display}</span>
                          <SearchSelect label={`Akun untuk ${display}`} placeholder="Pilih akun..." value={id} onChange={(v) => setPicked((p) => ({ ...p, [key]: v }))} options={userOptions} className="min-w-0 flex-1 text-sm" />
                          {isAuto && <span className="text-[11px] text-success">otomatis</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section>
                <p className="mb-2 text-sm font-semibold text-fg-muted">Pratinjau minggu pertama</p>
                <div className="max-h-72 overflow-y-auto rounded-2xl border border-line">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-line">
                      {parsed.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 whitespace-nowrap capitalize">{dayLabel(addDaysIso(weekStart, r.day), 'short')}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {r.templateName}
                            {(r.startTime || r.endTime) && (
                              <span className="ml-1 text-xs text-primary tabular">
                                {r.startTime ?? templates.find((t) => t.id === r.templateId)?.startTime}–{r.endTime ?? templates.find((t) => t.id === r.templateId)?.endTime}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.names.map((n) => {
                              const id = resolve(n.toLowerCase(), n);
                              return (
                                <span key={n} className={cx('mr-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold', !id ? 'bg-warning/15 text-warning' : id === SKIP ? 'bg-surface-3 text-fg-subtle line-through' : 'bg-success/12 text-success')}>
                                  {id && id !== SKIP ? nameOf(id) : n}
                                </span>
                              );
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {parsed.skipped.length > 0 && (
                <p className="rounded-xl bg-warning/10 p-3 text-xs">
                  Baris tidak dikenali (dilewati): {parsed.skipped.map((l) => `“${l}”`).join(', ')}. Pastikan nama shift sama dengan di tab Shift & tarif.
                </p>
              )}
              {unresolved.length > 0 && <p className="text-xs text-warning">Pilih akun untuk {unresolved.map(([, d]) => d).join(', ')} (atau Lewati) sebelum menerapkan.</p>}
            </>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </Modal>
  );
}
