import { ImageOff, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ROLE_LABEL, formatTime, lateLabel, type AttendanceSettings, type Role } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Empty, ErrorNote, Modal, Spinner, cx } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { addDays, formatDateLabel, today, useApi } from './hooks';
import type { Range } from './reportData';
import { DateRangeBar } from './ReportsPage';
import { summarizeAttendance, type DayState } from '../../lib/attendance-summary';

interface AttendanceRow {
  id: string;
  userId: string;
  userName: string;
  date: string;
  clockedAt: string;
  receivedAt: string;
  dueTime: string;
  lateMinutes: number;
  deviceName: string | null;
  hasPhoto: boolean;
  source: 'tablet' | 'hp';
  distanceM: number | null;
}
interface AttendanceData {
  settings: AttendanceSettings;
  timezone: string;
  today: string;
  staff: { id: string; name: string; role: Role }[];
  rows: AttendanceRow[];
  schedule: { userId: string; date: string; status: 'masuk' | 'izin' | 'sakit' | 'alpa' }[];
}

const DAY_STYLE: Record<DayState, { cls: string; label: string }> = {
  tepat: { cls: 'bg-success text-white', label: 'tepat waktu' },
  telat: { cls: 'bg-warning text-on-warning', label: 'telat' },
  'tidak-hadir': { cls: 'bg-danger text-white', label: 'tidak hadir' },
  belum: { cls: 'border border-dashed border-line-strong text-fg-muted', label: 'belum absen' },
  izin: { cls: 'bg-surface ring-2 ring-inset ring-primary text-primary', label: 'izin' },
  sakit: { cls: 'bg-surface ring-2 ring-inset ring-primary text-primary', label: 'sakit' },
  alpa: { cls: 'bg-danger/15 text-danger', label: 'tidak masuk (jadwal)' },
  libur: { cls: 'bg-surface-2 text-fg-subtle', label: 'libur' },
  kosong: { cls: 'text-fg-subtle/60', label: 'tidak ada jadwal' },
};
const LEGEND: DayState[] = ['tepat', 'telat', 'tidak-hadir', 'belum', 'izin', 'libur'];

/** Absen yang dibuat offline baru tiba belakangan; selisih besar antara jam tablet dan server ditandai agar bisa dicek. */
const DELAY_FLAG_MINUTES = 30;

export function AttendancePage() {
  const [range, setRange] = useState<Range>(() => ({ from: addDays(today(), -6), to: today() }));
  const { data, error, loading, reload } = useApi<AttendanceData>(`/attendance?from=${range.from}&to=${range.to}`);
  const [busy, setBusy] = useState('');

  // Owner membersihkan absen uji: orang yang absennya dihapus bisa absen lagi hari itu (dari tablet maupun HP).
  const removeOne = async (r: AttendanceRow) => {
    const ok = await confirmDialog({ title: `Hapus absen ${r.userName}?`, message: `Absen ${formatDateLabel(r.date)} pukul ${formatTime(r.clockedAt, data!.timezone)} beserta selfienya dihapus. ${r.userName} bisa absen lagi hari itu.`, confirmLabel: 'Hapus absen', danger: true });
    if (!ok) return;
    setBusy(r.id);
    try {
      await api(`/attendance/${r.id}`, { method: 'DELETE' });
      toast(`Absen ${r.userName} dihapus`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };
  // Jam masuk di jadwal salah lalu dibetulkan: hitung ulang telatnya dari jadwal yang berlaku sekarang.
  const recalc = async (r: AttendanceRow) => {
    setBusy(r.id);
    try {
      const x = await api<{ dueTime: string; shiftName: string | null; lateMinutes: number; changed: boolean }>(`/attendance/${r.id}/recalc`, { method: 'POST', body: {} });
      const basis = `jam masuk ${x.dueTime}${x.shiftName ? ` (${x.shiftName})` : ''}`;
      toast(x.changed ? `${r.userName}: ${lateLabel(x.lateMinutes).toLowerCase()} dari ${basis}` : `Sudah sesuai jadwal: ${basis}`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };
  const clearDay = async (date: string, count: number) => {
    const ok = await confirmDialog({ title: `Hapus semua absen ${formatDateLabel(date)}?`, message: `${count} absen beserta selfienya dihapus. Semua karyawan bisa absen ulang hari itu.`, confirmLabel: 'Hapus semua', danger: true });
    if (!ok) return;
    setBusy(date);
    try {
      await api('/attendance/clear-day', { method: 'POST', body: { date } });
      toast('Absen hari itu dikosongkan');
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  // Hari yang ada absennya (untuk kartu per hari di bawah).
  const days = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.date))].sort().reverse(), [data]);
  // Rekap per orang dihitung dari jadwal: hari kerja = dijadwalkan masuk; yang libur/izin tidak dihitung tidak hadir.
  const dates = useMemo(() => {
    if (!data) return [];
    const out: string[] = [];
    const end = range.to < data.today ? range.to : data.today;
    for (let d = range.from; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [data, range]);
  const summary = useMemo(() => {
    if (!data) return [];
    const per = new Map(summarizeAttendance({ dates, today: data.today, staff: data.staff, rows: data.rows, schedule: data.schedule ?? [] }).map((p) => [p.userId, p]));
    return data.staff.map((u) => ({ ...u, ...per.get(u.id)! }));
  }, [data, dates]);
  const stateOf = (userId: string, date: string) => summary.find((p) => p.id === userId)?.days.find((d) => d.date === date)?.state;

  return (
    <div className="p-4">
      <PageHeader title="Absensi" subtitle="Absen masuk karyawan dari tablet kasir atau HP masing-masing: selfie, jam kedatangan, dan lokasinya." />
      {data && !data.settings.enabled && (
        <p className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
          Absensi belum diaktifkan. Nyalakan dan atur jam masuk di{' '}
          <Link to="/admin/pengaturan?bagian=kasir" className="font-semibold text-primary underline">
            Pengaturan → Aturan kasir
          </Link>
          . Setelah itu tombol <b>Absen masuk</b> muncul di layar login tablet kasir.
        </p>
      )}
      <DateRangeBar value={range} onChange={setRange} />
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      {data && (
        <div className="mt-4 flex flex-col gap-4">
          <section className="tile p-1">
            <ul className="flex flex-col divide-y divide-line sm:hidden">
              {summary.map((u) => (
                <li key={u.id} className="px-3 py-3">
                  <p className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="font-semibold">{u.name}</span> <span className="text-xs text-fg-muted">{ROLE_LABEL[u.role]}</span>
                    </span>
                    <span className="text-sm tabular">
                      hadir <b>{u.present}</b> dari {u.workDays} hari kerja
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-muted tabular">
                    <span className="text-success">{u.onTime} tepat waktu</span>
                    <span className={u.late ? 'text-[#8a5a00]' : ''}>
                      {u.late} telat{u.lateTotal ? ` (${u.lateTotal} menit)` : ''}
                    </span>
                    <span className={u.absent ? 'text-danger' : ''}>{u.absent} tidak hadir</span>
                    {u.excused > 0 && <span>{u.excused} izin/sakit</span>}
                  </p>
                  <div className="mt-2">
                    <DayStrip days={u.days} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5">Karyawan</th>
                    <th className="px-3 py-2.5 text-right" title="Hari dijadwalkan masuk sampai hari ini">Hari kerja</th>
                    <th className="px-3 py-2.5 text-right" title="Tepat waktu + telat">Hadir</th>
                    <th className="px-3 py-2.5 text-right">Tepat waktu</th>
                    <th className="px-3 py-2.5 text-right">Telat</th>
                    <th className="px-3 py-2.5 text-right">Tidak hadir</th>
                    <th className="px-4 py-2.5">Per hari</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.map((u) => (
                    <tr key={u.id} className="align-top">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{u.name}</span> <span className="text-xs text-fg-muted">{ROLE_LABEL[u.role]}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular">{u.workDays} hari</td>
                      <td className="px-3 py-3 text-right tabular">
                        <span className="font-bold">{u.present}</span>
                        <span className="text-fg-muted"> / {u.workDays}</span>
                      </td>
                      <td className={cx('px-3 py-3 text-right font-semibold tabular', u.onTime ? 'text-success' : 'text-fg-subtle')}>{u.onTime}</td>
                      <td className="px-3 py-3 text-right tabular">
                        <span className={cx('font-semibold', u.late ? 'text-[#8a5a00]' : 'text-fg-subtle')}>{u.late}</span>
                        {u.lateTotal > 0 && <span className="block text-xs text-fg-muted">{u.lateTotal} menit</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        <span className={cx('font-semibold', u.absent ? 'text-danger' : 'text-fg-subtle')}>{u.absent}</span>
                        {u.excused > 0 && <span className="block text-xs text-fg-muted">+{u.excused} izin/sakit</span>}
                      </td>
                      <td className="px-4 py-3">
                        <DayStrip days={u.days} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!summary.length && <Empty title="Belum ada karyawan" />}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-1 pb-3 text-xs text-fg-muted">
              {LEGEND.map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cx('size-3 rounded', DAY_STYLE[k].cls)} /> {k === 'izin' ? 'izin/sakit' : DAY_STYLE[k].label}
                </span>
              ))}
              <span className="basis-full">
                Hari kerja = hari dijadwalkan masuk sampai hari ini (hari tanpa jadwal: hari toko buka). Hadir = tepat waktu + telat. Jam masuk mengikuti shift di jadwal; tanpa jadwal {data.settings.startTime}
                {data.settings.graceMinutes ? `, toleransi ${data.settings.graceMinutes} menit` : ''}.
              </span>
            </div>
          </section>

          {!days.length && (
            <div className="tile">
              <Empty icon={<UserRound className="size-6" />} title="Belum ada absen pada rentang ini" />
            </div>
          )}
          {days.map((date) => {
            const rows = data.rows.filter((r) => r.date === date);
            const here = new Set(rows.map((r) => r.userId));
            // Hanya yang wajib masuk hari itu; yang libur/izin di jadwal tidak ditandai.
            const missing = data.staff.filter((u) => !here.has(u.id) && (stateOf(u.id, date) === 'tidak-hadir' || stateOf(u.id, date) === 'belum'));
            const notYet = missing.filter((u) => stateOf(u.id, date) === 'belum').length;
            const absentCount = missing.length - notYet;
            return (
              <section key={date} className="tile p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {formatDateLabel(date)} <span className="text-sm font-normal text-fg-muted">· {rows.length} hadir{absentCount ? `, ${absentCount} tidak hadir` : ''}{notYet ? `, ${notYet} belum absen` : ''}</span>
                  </h3>
                  {rows.length > 0 && (
                    <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10!" icon={<Trash2 className="size-4" />} loading={busy === date} onClick={() => void clearDay(date, rows.length)}>
                      Hapus semua absen hari ini
                    </Button>
                  )}
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((r) => {
                    const delayed = (new Date(r.receivedAt).getTime() - new Date(r.clockedAt).getTime()) / 60000 > DELAY_FLAG_MINUTES;
                    return (
                      <li key={r.id} className="tile-soft animate-rise group relative flex items-center gap-3 p-3">
                        <Selfie row={r} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{r.userName}</p>
                          <p className="text-2xl leading-tight font-bold tabular">{formatTime(r.clockedAt, data.timezone)}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge tone={r.lateMinutes ? 'amber' : 'green'}>{lateLabel(r.lateMinutes)}</Badge>
                            <span className="text-[11px] text-fg-muted tabular">jadwal {r.dueTime}</span>
                            <span className="text-[11px] text-fg-muted">{r.source === 'hp' ? `HP${r.distanceM !== null ? ` · ${r.distanceM} m dari toko` : ''}` : (r.deviceName ?? 'Tablet')}</span>
                            {delayed && <span className="text-[11px] text-fg-muted">· terkirim {formatTime(r.receivedAt, data.timezone)}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col self-start">
                          <button
                            aria-label={`Hitung ulang telat ${r.userName} dari jadwal`}
                            title="Hitung ulang telat dari jadwal sekarang"
                            disabled={busy === r.id}
                            onClick={() => void recalc(r)}
                            className="grid size-10 place-items-center rounded-xl text-fg-subtle transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                          >
                            <RefreshCw className={cx('size-4', busy === r.id && 'animate-spin')} />
                          </button>
                          <button
                            aria-label={`Hapus absen ${r.userName}`}
                            disabled={busy === r.id}
                            onClick={() => void removeOne(r)}
                            className="grid size-10 place-items-center rounded-xl text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {missing.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 rounded-[18px] border border-dashed border-line-strong p-3">
                      <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-fg-subtle">
                        <UserRound className="size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{u.name}</p>
                        {stateOf(u.id, date) === 'belum' ? <Badge>Belum absen</Badge> : <Badge tone="red">Tidak hadir</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Foto diambil dengan sesi owner (tidak bisa lewat <img src> biasa), lalu ditampilkan dari memori. */
function Selfie({ row }: { row: AttendanceRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(!row.hasPhoto);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!row.hasPhoto) return;
    let live = true;
    let made: string | null = null;
    api<Response>(`/attendance/${row.id}/photo`, { raw: true })
      .then((r) => r.blob())
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [row.id, row.hasPhoto]);
  return (
    <>
      <button onClick={() => url && setOpen(true)} aria-label={`Lihat selfie ${row.userName}`} className="press grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface">
        {url ? <img src={url} alt={`Selfie ${row.userName}`} className="size-16 object-cover" /> : failed ? <ImageOff className="size-5 text-fg-subtle" /> : <Spinner />}
      </button>
      {open && url && (
        <Modal open size="md" onClose={() => setOpen(false)} title={`${row.userName} · ${formatDateLabel(row.date)}`}>
          <img src={url} alt={`Selfie ${row.userName}`} className="mx-auto max-h-[70vh] rounded-xl" />
        </Modal>
      )}
    </>
  );
}

/** Status tiap hari satu orang: kotak berwarna dengan tanggalnya. */
function DayStrip({ days }: { days: { date: string; state: DayState; lateMinutes: number }[] }) {
  return (
    <div className="flex max-w-[300px] flex-wrap gap-1">
      {days.map((d) => (
        <span
          key={d.date}
          title={`${formatDateLabel(d.date)}: ${d.state === 'telat' ? `telat ${d.lateMinutes} menit` : DAY_STYLE[d.state].label}`}
          className={cx('grid size-6 place-items-center rounded-md text-[10px] font-bold tabular', DAY_STYLE[d.state].cls)}
        >
          {Number(d.date.slice(8))}
        </span>
      ))}
    </div>
  );
}
