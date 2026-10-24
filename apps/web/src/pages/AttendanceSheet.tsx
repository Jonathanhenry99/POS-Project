import { CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, ROLE_LABEL, formatTime, lateLabel, verifyPin, type CachedUser } from '@mourden/shared';
import { SelfieCamera } from '../components/SelfieCamera';
import { Button, ErrorNote, Modal, PinPad, cx } from '../components/ui';
import { clockIn, todaysAttendance, type LocalClockIn } from '../lib/attendance';
import { useApp } from '../lib/state';

/**
 * Absen masuk di tablet kasir: pilih nama -> PIN sendiri -> selfie. Tablet berada di toko, jadi absen dari sini
 * sekaligus bukti orangnya sudah di tempat. Tersimpan lokal dulu, terkirim saat ada internet.
 */
export function AttendanceSheet({ onClose }: { onClose: () => void }) {
  const users = useApp((s) => s.data?.users ?? NO_USERS);
  const cfg = useApp((s) => s.data?.settings.attendance) ?? DEFAULT_SETTINGS.attendance!;
  const tz = useApp((s) => s.data?.settings.store.timezone) ?? 'Asia/Jakarta';
  const staff = users.filter((u) => u.role !== 'owner');
  const [done, setDone] = useState<Record<string, LocalClockIn>>({});
  const [picked, setPicked] = useState<CachedUser | null>(null);
  const [verified, setVerified] = useState(false);
  const [photo, setPhoto] = useState('');
  const [result, setResult] = useState<LocalClockIn | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void todaysAttendance().then(setDone);
  }, []);

  const back = () => {
    setPicked(null);
    setVerified(false);
    setPhoto('');
    setError('');
  };

  const save = async () => {
    if (!picked || !photo) return;
    setBusy(true);
    setError('');
    try {
      setResult(await clockIn(picked, photo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (picked && result) {
    const late = result.lateMinutes > 0;
    return (
      <Modal open size="sm" onClose={onClose} title="Absen tercatat">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className={cx('size-14', late ? 'text-warning' : 'text-success')} />
          <p className="text-xl font-bold">{picked.name}</p>
          <p className="text-4xl font-extrabold tracking-tight tabular">{formatTime(result.at, tz)}</p>
          <p className={cx('rounded-full px-3 py-1.5 text-sm font-bold', late ? 'bg-warning/15 text-warning' : 'bg-success/12 text-success')}>{lateLabel(result.lateMinutes)}</p>
          <p className="text-sm text-fg-muted">Jam masuk {cfg.startTime}. Absen dan foto terkirim ke owner saat tablet terhubung internet.</p>
          <Button size="lg" className="mt-2 w-full" onClick={onClose}>
            Selesai
          </Button>
        </div>
      </Modal>
    );
  }

  if (picked && verified) {
    return (
      <Modal open size="sm" onClose={back} dismissable={!busy} title={`Selfie ${picked.name}`}>
        <div className="flex flex-col gap-4">
          <SelfieCamera size={240} photo={photo} onPhoto={(p) => { setPhoto(p); setError(''); }} />
          <ErrorNote>{error}</ErrorNote>
          {photo && (
            <Button variant="success" size="lg" className="animate-float-up" loading={busy} onClick={() => void save()}>
              Simpan absen
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  if (picked) {
    return (
      <Modal open size="sm" onClose={back} title={`PIN ${picked.name}`}>
        <p className="mb-4 text-center text-sm text-fg-muted">Masukkan PIN Anda sendiri, lalu ambil selfie.</p>
        <PinPad
          submitLabel="Lanjut"
          error={error}
          onSubmit={async (pin) => {
            setError('');
            // Di mode pratinjau hash PIN tidak tersedia; di tablet kasir PIN selalu diverifikasi.
            if (picked.pinHash && !(await verifyPin(pin, picked.pinHash))) return setError('PIN salah');
            setVerified(true);
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal open size="md" onClose={onClose} title="Absen masuk">
      <p className="mb-3 flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
        <Clock className="size-5 shrink-0 text-primary" />
        <span>
          Jam masuk <b className="text-fg tabular">{cfg.startTime}</b>
          {cfg.graceMinutes > 0 && ` (toleransi ${cfg.graceMinutes} menit)`}. Absen setelah itu tercatat telat dan dikabarkan ke owner.
        </span>
      </p>
      <ErrorNote>{error}</ErrorNote>
      <ul className="grid gap-2 sm:grid-cols-2">
        {staff.map((u) => {
          const mine = done[u.id];
          return (
            <li key={u.id}>
              <button disabled={!!mine} onClick={() => { setError(''); setPicked(u); }} className="press flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-primary/50 disabled:opacity-70">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">{u.name.trim().slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.name}</span>
                  <span className="block text-xs text-fg-muted">{ROLE_LABEL[u.role]}</span>
                </span>
                {mine ? (
                  <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap', mine.lateMinutes ? 'bg-warning/15 text-warning' : 'bg-success/12 text-success')}>Absen {formatTime(mine.at, tz)}</span>
                ) : (
                  <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-fg-muted">Belum</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!staff.length && <p className="py-6 text-center text-fg-muted">Belum ada karyawan. Tambahkan di Hak Akses.</p>}
    </Modal>
  );
}

const NO_USERS: CachedUser[] = [];
