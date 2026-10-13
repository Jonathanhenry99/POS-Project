import { ImageOff, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ROLE_LABEL, formatTime, lateLabel, type AttendanceSettings, type Role } from '@mourden/shared';
import { Badge, Empty, ErrorNote, Modal, Spinner, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { PageHeader } from './AdminRoutes';
import { addDays, formatDateLabel, today, useApi } from './hooks';
import type { Range } from './reportData';
import { DateRangeBar } from './ReportsPage';

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
}
interface AttendanceData {
  settings: AttendanceSettings;
  timezone: string;
  staff: { id: string; name: string; role: Role }[];
  rows: AttendanceRow[];
}

/** Absen yang dibuat offline baru tiba belakangan; selisih besar antara jam tablet dan server ditandai agar bisa dicek. */
const DELAY_FLAG_MINUTES = 30;

export function AttendancePage() {
  const [range, setRange] = useState<Range>(() => ({ from: addDays(today(), -6), to: today() }));
  const { data, error, loading } = useApi<AttendanceData>(`/attendance?from=${range.from}&to=${range.to}`);

  // Hari yang ada absennya dianggap hari toko buka; karyawan tanpa absen di hari itu ditandai "Tidak absen".
  const days = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.date))].sort().reverse(), [data]);
  const summary = useMemo(
    () =>
      (data?.staff ?? []).map((u) => {
        const mine = (data?.rows ?? []).filter((r) => r.userId === u.id);
        const late = mine.filter((r) => r.lateMinutes > 0);
        return { ...u, present: mine.length, late: late.length, lateTotal: late.reduce((n, r) => n + r.lateMinutes, 0), absent: days.length - mine.length };
      }),
    [data, days],
  );

  return (
    <div className="p-4">
      <PageHeader title="Absensi" subtitle="Absen masuk karyawan dari tablet kasir: PIN sendiri, selfie, dan jam kedatangan." />
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
          <section className="tile overflow-x-auto p-1">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-fg-muted">
                <tr>
                  <th className="px-4 py-2.5">Karyawan</th>
                  <th className="px-4 py-2.5 text-right">Hadir</th>
                  <th className="px-4 py-2.5 text-right">Telat</th>
                  <th className="px-4 py-2.5 text-right">Total telat</th>
                  <th className="px-4 py-2.5 text-right">Tidak absen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">{u.name}</span> <span className="text-xs text-fg-muted">{ROLE_LABEL[u.role]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{u.present}</td>
                    <td className={cx('px-4 py-2.5 text-right font-semibold tabular', u.late ? 'text-warning' : 'text-fg-subtle')}>{u.late}</td>
                    <td className="px-4 py-2.5 text-right tabular">{u.lateTotal ? `${u.lateTotal} menit` : '-'}</td>
                    <td className={cx('px-4 py-2.5 text-right font-semibold tabular', u.absent ? 'text-danger' : 'text-fg-subtle')}>{u.absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!summary.length && <Empty title="Belum ada karyawan" />}
            <p className="px-4 pb-3 text-xs text-fg-muted">Dihitung dari {days.length} hari yang ada absennya pada rentang ini. Jam masuk saat ini {data.settings.startTime}{data.settings.graceMinutes ? `, toleransi ${data.settings.graceMinutes} menit` : ''}.</p>
          </section>

          {!days.length && (
            <div className="tile">
              <Empty icon={<UserRound className="size-6" />} title="Belum ada absen pada rentang ini" />
            </div>
          )}
          {days.map((date) => {
            const rows = data.rows.filter((r) => r.date === date);
            const here = new Set(rows.map((r) => r.userId));
            const missing = data.staff.filter((u) => !here.has(u.id));
            return (
              <section key={date} className="tile p-4">
                <h3 className="mb-3 font-semibold">
                  {formatDateLabel(date)} <span className="text-sm font-normal text-fg-muted">· {rows.length} hadir{missing.length ? `, ${missing.length} tidak absen` : ''}</span>
                </h3>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((r) => {
                    const delayed = (new Date(r.receivedAt).getTime() - new Date(r.clockedAt).getTime()) / 60000 > DELAY_FLAG_MINUTES;
                    return (
                      <li key={r.id} className="tile-soft flex items-center gap-3 p-3">
                        <Selfie row={r} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{r.userName}</p>
                          <p className="text-2xl leading-tight font-bold tabular">{formatTime(r.clockedAt, data.timezone)}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge tone={r.lateMinutes ? 'amber' : 'green'}>{lateLabel(r.lateMinutes)}</Badge>
                            {delayed && <span className="text-[11px] text-fg-muted">terkirim {formatTime(r.receivedAt, data.timezone)}</span>}
                          </p>
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
                        <Badge tone="red">Tidak absen</Badge>
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
