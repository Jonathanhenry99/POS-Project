import { ArrowRight, Camera, CheckCircle2, LoaderCircle, LogOut, MapPin, MapPinOff, Navigation, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { checkLocation, clockToMinutes, lateLabel, ROLE_LABEL } from '@mourden/shared';
import { BrandLogo } from '../../components/BrandLogo';
import { SelfieCamera } from '../../components/SelfieCamera';
import { cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { currentLocation, serverOffset, submitMyAttendance, useMyAttendance, type LocationState, type MyAttendance, type MyAttendanceDay } from '../../lib/my-attendance';
import { logout } from '../../lib/session';
import { useApp } from '../../lib/state';

/** Lebar "jendela" cincin hitung mundur: satu jam terakhir sebelum batas jam masuk. */
const WINDOW_MIN = 60;
const LIME = '#c8f465';
const AMBER = '#f5a524';

interface Clock {
  hh: string;
  mm: string;
  ss: string;
  /** Menit (desimal) sejak tengah malam di zona waktu toko. */
  minutes: number;
  hour: number;
  iso: string;
}

/** Jam yang berdetak tiap detik, mengikuti jam server (bukan jam HP) pada zona waktu toko. */
function useClock(timeZone: string): Clock {
  const fmt = useMemo(() => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }), [timeZone]);
  const read = () => {
    const now = new Date(Date.now() + serverOffset());
    const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
    return { hh: p.hour, mm: p.minute, ss: p.second, hour: Number(p.hour), minutes: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60, iso: now.toISOString() };
  };
  const [clock, setClock] = useState(read);
  useEffect(() => {
    const t = setInterval(() => setClock(read()), 1000);
    return () => clearInterval(t);
    // Formatter hanya berganti bila zona waktu berganti.
  }, [fmt]);
  return clock;
}

function greeting(hour: number) {
  return hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
}

function spanLabel(minutes: number) {
  const m = Math.max(0, Math.ceil(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h} jam${m % 60 ? ` ${m % 60} menit` : ''}` : `${m} menit`;
}

/** Layar absen untuk akun barista/kitchen di HP: pintu masuk tiap pagi sebelum membuka stock opname. */
export function MyAttendancePage() {
  const user = useApp((s) => s.user)!;
  const navigate = useNavigate();
  const { data, error, loading } = useMyAttendance(true);
  const [capturing, setCapturing] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-4">
        <BrandLogo className="h-11 w-12 rounded-xl" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[17px] font-extrabold tracking-tight">Absensi</p>
          <p className="truncate text-xs text-fg-muted">
            {user.name} · {ROLE_LABEL[user.role]}
          </p>
        </div>
        <button
          aria-label="Keluar"
          className="press grid size-11 place-items-center rounded-xl bg-surface shadow-card"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-10">
        {loading && !data && <LoadingHero />}
        {error && !data && (
          <p className="tile flex items-start gap-3 p-4 text-sm">
            <TriangleAlert className="size-5 shrink-0 text-danger" />
            <span>
              Status absen tidak bisa dimuat: {error}.{' '}
              <Link to="/stok" className="font-semibold text-primary underline">
                Buka Stok
              </Link>
            </span>
          </p>
        )}
        {data && !data.enabled && (
          <div className="tile animate-rise p-5 text-center">
            <p className="font-semibold">Absensi belum diaktifkan owner</p>
            <p className="mt-1 text-sm text-fg-muted">Anda bisa langsung bekerja.</p>
            <Link to="/stok" className="press mt-4 inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--ink)] px-5 font-semibold text-white">
              Buka Stok <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
        {data?.enabled && <Ready data={data} name={user.name} onCapture={() => setCapturing(true)} />}
      </main>

      {capturing && data && <CaptureSheet data={data} onClose={() => setCapturing(false)} onContinue={() => navigate('/stok', { replace: true })} />}
    </div>
  );
}

function LoadingHero() {
  return (
    <div className="flex flex-col gap-4">
      <div className="skeleton h-[420px] rounded-[28px]" />
      <div className="skeleton h-16 rounded-2xl" />
    </div>
  );
}

function Ready({ data, name, onCapture }: { data: MyAttendance; name: string; onCapture: () => void }) {
  const clock = useClock(data.timezone);
  const done = data.today;
  const deadline = clockToMinutes(data.startTime) + Math.max(0, data.graceMinutes);
  const left = deadline - clock.minutes;
  const late = !done && left < 0;
  const progress = done || late ? 1 : Math.min(1, Math.max(0, 1 - left / WINDOW_MIN));
  const dateLabel = new Intl.DateTimeFormat('id-ID', { timeZone: data.timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(clock.iso));

  return (
    <>
      <section className="bg-grad-header relative overflow-hidden rounded-[28px] px-5 pt-5 pb-6 text-white shadow-[0_30px_60px_-30px_rgb(16_21_19/0.8)] animate-rise">
        <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full opacity-60 blur-3xl" style={{ background: done ? LIME : late ? AMBER : 'rgb(200 244 101 / 0.55)' }} />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/70">{greeting(clock.hour)},</p>
            <p className="text-xl font-extrabold tracking-tight">{name}</p>
            <p className="mt-0.5 text-sm text-white/70">{dateLabel}</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 backdrop-blur">{data.storeName}</span>
        </div>

        <Ring progress={progress} color={late ? AMBER : LIME} pulse={late}>
          {done ? (
            <>
              <CheckCircle2 className="animate-pop mb-1 size-7" style={{ color: LIME }} />
              <p className="text-[52px] leading-none font-extrabold tracking-tight tabular">{timeOf(done.clockedAt, data.timezone)}</p>
              <p className="mt-2 text-xs font-semibold tracking-wide text-white/60 uppercase">Absen masuk</p>
            </>
          ) : (
            <>
              <p className="text-[56px] leading-none font-extrabold tracking-tight tabular">
                {clock.hh}
                <span className="animate-pulse text-white/60">:</span>
                {clock.mm}
              </p>
              <p className="mt-1 text-lg font-semibold text-white/50 tabular">{clock.ss}</p>
              <p className="mt-1 text-xs font-semibold tracking-wide text-white/60 uppercase">Jam masuk {data.startTime}</p>
            </>
          )}
        </Ring>

        <div className="relative mt-1 flex justify-center">
          {done ? (
            <StatusPill tone={done.lateMinutes ? 'amber' : 'lime'}>
              {lateLabel(done.lateMinutes)}
              {done.source === 'tablet' ? ' · dari tablet kasir' : ''}
            </StatusPill>
          ) : late ? (
            <StatusPill tone="amber">Terlambat {spanLabel(-left)}</StatusPill>
          ) : (
            <StatusPill tone="lime">{spanLabel(left)} lagi sebelum jam masuk</StatusPill>
          )}
        </div>
      </section>

      {done ? (
        <Link to="/stok" className="press animate-float-up flex h-16 items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] text-lg font-extrabold text-[var(--lime-ink)] shadow-[0_18px_40px_-18px_rgb(200_244_101/0.9)]">
          Lanjut ke Stock Opname <ArrowRight className="size-5" />
        </Link>
      ) : (
        <button
          onClick={onCapture}
          className={cx(
            'press animate-breathe flex h-16 items-center justify-center gap-3 rounded-2xl text-lg font-extrabold',
            late ? 'bg-[#f5a524] text-[#3b2600]' : 'bg-[var(--lime)] text-[var(--lime-ink)]',
          )}
        >
          <Camera className="size-6" /> Absen sekarang
        </button>
      )}

      <p className="tile-soft flex items-start gap-3 px-4 py-3 text-sm text-fg-muted animate-float-up">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
        {data.location.set ? (
          <span>
            Absen hanya bisa dari toko (radius {data.location.radiusM} m). Nyalakan GPS dan izinkan lokasi saat diminta.
          </span>
        ) : (
          <span>Selfie diambil langsung dari kamera, jam dicatat dari server. Absen setelah {data.startTime}{data.graceMinutes ? ` (+${data.graceMinutes} menit toleransi)` : ''} tercatat terlambat.</span>
        )}
      </p>

      <History data={data} />
    </>
  );
}

function timeOf(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

function StatusPill({ tone, children }: { tone: 'lime' | 'amber'; children: React.ReactNode }) {
  return (
    <span key={String(children)} className={cx('animate-fade-in rounded-full px-4 py-2 text-sm font-bold', tone === 'lime' ? 'bg-[var(--lime)]/15 text-[var(--lime)]' : 'bg-[#f5a524]/20 text-[#ffc861]')}>
      {children}
    </span>
  );
}

/** Cincin progres dengan 48 garis detik yang menyala bertahap menuju jam masuk. */
function Ring({ progress, color, pulse, children }: { progress: number; color: string; pulse: boolean; children: React.ReactNode }) {
  const size = 248;
  const r = 104;
  // Mulai dari 0 lalu bergerak ke nilai sebenarnya, supaya cincin "terisi" saat layar dibuka.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(progress));
    return () => cancelAnimationFrame(t);
  }, [progress]);
  const ticks = 48;
  return (
    <div className="relative mx-auto mt-4 grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * 2 * Math.PI;
          const lit = i / ticks < shown;
          return (
            <line
              key={i}
              x1={size / 2 + Math.cos(a) * 118}
              y1={size / 2 + Math.sin(a) * 118}
              x2={size / 2 + Math.cos(a) * (i % 4 === 0 ? 111 : 114)}
              y2={size / 2 + Math.sin(a) * (i % 4 === 0 ? 111 : 114)}
              stroke={lit ? color : 'rgb(255 255 255 / 0.18)'}
              strokeWidth={i % 4 === 0 ? 2.5 : 1.5}
              strokeLinecap="round"
              style={{ transition: `stroke 400ms ${i * 12}ms` }}
            />
          );
        })}
        <circle cx={size / 2} cy={size / 2} r={r - 8} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth={12} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r - 8}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * (r - 8)}
          strokeDashoffset={2 * Math.PI * (r - 8) * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.2, 0.8, 0.2, 1), stroke 400ms', filter: `drop-shadow(0 0 10px ${color}88)` }}
          className={pulse ? 'animate-pulse' : undefined}
        />
      </svg>
      <span className="sr-only">{Math.round(progress * 100)} persen menuju jam masuk</span>
      <div className="relative flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}

/** 14 hari terakhir: hijau tepat waktu, kuning terlambat, abu-abu tidak absen. */
function History({ data }: { data: MyAttendance }) {
  const byDate = new Map(data.history.map((d) => [d.date, d]));
  const today = data.today?.date ?? new Intl.DateTimeFormat('en-CA', { timeZone: data.timezone }).format(new Date(Date.now() + serverOffset()));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const onTime = data.history.filter((d) => !d.lateMinutes).length;
  const late = data.history.length - onTime;
  return (
    <section className="tile animate-float-up p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">14 hari terakhir</h2>
        <p className="text-xs text-fg-muted">
          <b className="text-success">{onTime}</b> tepat · <b className="text-warning">{late}</b> telat
        </p>
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((date, i) => {
          const d = byDate.get(date);
          const isToday = date === today;
          const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' }).slice(0, 3);
          return (
            <li
              key={date}
              title={d ? `${date}: ${timeOf(d.clockedAt, data.timezone)} · ${lateLabel(d.lateMinutes)}` : `${date}: tidak ada absen`}
              className={cx('animate-rise flex flex-col items-center gap-1 rounded-xl py-2', isToday ? 'bg-[var(--ink)] text-white' : 'bg-surface-2')}
              style={{ animationDelay: `${i * 25}ms` } as CSSProperties}
            >
              <span className={cx('text-[10px] font-semibold uppercase', isToday ? 'text-white/60' : 'text-fg-subtle')}>{label}</span>
              <span className="text-sm font-bold tabular">{Number(date.slice(8))}</span>
              <span className={cx('size-2 rounded-full', d ? (d.lateMinutes ? 'bg-warning' : 'bg-success') : isToday ? 'bg-white/30' : 'bg-line-strong')} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ Lembar kamera

type Phase = 'camera' | 'sending' | 'done';

function CaptureSheet({ data, onClose, onContinue }: { data: MyAttendance; onClose: () => void; onContinue: () => void }) {
  const [photo, setPhoto] = useState('');
  const [phase, setPhase] = useState<Phase>('camera');
  const [error, setError] = useState('');
  const [where, setWhere] = useState<LocationState | null>(data.location.set ? { kind: 'locating' } : null);
  const [result, setResult] = useState<MyAttendanceDay | null>(null);

  const locate = () => {
    if (!data.location.set) return;
    setWhere({ kind: 'locating' });
    void currentLocation().then(setWhere);
  };
  useEffect(locate, [data.location.set]);

  // Tutup dengan tombol kembali/Escape tanpa ikut menutup halaman.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && phase !== 'sending' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  // Jarak dihitung juga di HP supaya karyawan tahu sebelum menekan Kirim; keputusan akhirnya tetap di server.
  const check = where?.kind === 'ok' && data.location.lat !== null && data.location.lng !== null ? checkLocation({ storeLat: data.location.lat, storeLng: data.location.lng, radiusM: data.location.radiusM }, where.at) : null;
  const blocked = data.location.set && (where?.kind !== 'ok' || (check !== null && !check.inside));
  const send = async () => {
    setPhase('sending');
    setError('');
    try {
      const day = await submitMyAttendance(photo, where?.kind === 'ok' ? where.at : null);
      navigator.vibrate?.([20, 60, 30]);
      setResult(day);
      setPhase('done');
    } catch (e) {
      setError(errorMessage(e));
      setPhase('camera');
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Selfie absen" className="animate-sheet fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0b0f0d] text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-50" style={{ background: 'radial-gradient(420px 260px at 50% 0%, rgb(200 244 101 / 0.22), transparent 70%)' }} />
      {phase === 'done' && result ? (
        <Success day={result} data={data} onContinue={onContinue} onClose={onClose} />
      ) : (
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-3 pb-6">
          <div className="flex items-center justify-between">
            <button aria-label="Tutup" disabled={phase === 'sending'} onClick={onClose} className="press grid size-11 place-items-center rounded-full bg-white/10">
              <X className="size-5" />
            </button>
            <p className="font-semibold">Selfie absen</p>
            <span className="size-11" />
          </div>

          <div className="mt-3 flex justify-center">
            <LocationChip state={where} check={check} radius={data.location.radiusM} onRetry={locate} />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
            <SelfieCamera dark photo={photo} onPhoto={(p) => { setPhoto(p); setError(''); }} />
            {!photo && <p className="mt-1 text-center text-sm text-white/60">Posisikan wajah di dalam lingkaran, lalu tekan tombol.</p>}
          </div>

          {error && (
            <p role="alert" className="animate-rise mb-3 flex items-start gap-2 rounded-2xl bg-[#ff5d5d]/15 p-3 text-sm text-[#ffb3b3]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          {photo && (
            <button
              onClick={() => void send()}
              disabled={phase === 'sending' || blocked}
              className="press animate-float-up flex h-16 items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] text-lg font-extrabold text-[var(--lime-ink)] disabled:opacity-50"
            >
              {phase === 'sending' ? <LoaderCircle className="size-6 animate-spin" /> : <CheckCircle2 className="size-6" />}
              {phase === 'sending' ? 'Mengirim...' : check && !check.inside ? 'Di luar area toko' : blocked ? 'Menunggu lokasi...' : 'Kirim absen'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LocationChip({ state, check, radius, onRetry }: { state: LocationState | null; check: { inside: boolean; distanceM: number | null } | null; radius: number; onRetry: () => void }) {
  if (!state) return null;
  if (state.kind === 'locating')
    return (
      <span className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm">
        <Navigation className="size-4 animate-pulse" /> Mencari lokasi...
      </span>
    );
  if (state.kind === 'ok' && check && !check.inside)
    return (
      <button onClick={onRetry} className="press animate-fade-in flex items-center gap-2 rounded-full bg-[#f5a524]/20 px-3.5 py-2 text-sm font-semibold text-[#ffc861]">
        <MapPinOff className="size-4" /> {distanceLabel(check.distanceM ?? 0)} dari toko · batas {radius} m
      </button>
    );
  if (state.kind === 'ok')
    return (
      <span className="animate-fade-in flex items-center gap-2 rounded-full bg-[var(--lime)]/15 px-3.5 py-2 text-sm font-semibold text-[var(--lime)]">
        <MapPin className="size-4" /> {check ? `Di toko · ${distanceLabel(check.distanceM ?? 0)} dari titik toko` : `Lokasi ditemukan (± ${Math.round(state.at.accuracy)} m)`}
      </span>
    );
  return (
    <button onClick={onRetry} className="press flex items-center gap-2 rounded-full bg-[#f5a524]/20 px-3.5 py-2 text-sm font-semibold text-[#ffc861]">
      <MapPinOff className="size-4" />
      {state.kind === 'denied' ? 'Izin lokasi ditolak · ketuk untuk coba lagi' : 'Lokasi tidak didapat · ketuk untuk coba lagi'}
      <span className="sr-only">Absen hanya bisa dalam radius {radius} meter dari toko.</span>
    </button>
  );
}

function distanceLabel(m: number) {
  return m >= 1000 ? `± ${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km` : `${m} m`;
}

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * 2 * Math.PI;
  const d = 88 + (i % 3) * 22;
  return { dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, color: [LIME, '#ffffff', '#a48cf0'][i % 3], delay: (i % 4) * 40, size: 6 + (i % 3) * 2 };
});

function Success({ day, data, onContinue, onClose }: { day: MyAttendanceDay; data: MyAttendance; onContinue: () => void; onClose: () => void }) {
  const late = day.lateMinutes > 0;
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative grid size-56 place-items-center">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="animate-burst absolute rounded-full"
            style={{ width: p.size, height: p.size, background: p.color, '--dx': p.dx, '--dy': p.dy, animationDelay: `${180 + p.delay}ms` } as CSSProperties}
          />
        ))}
        <span aria-hidden="true" className="animate-ping-soft absolute size-28 rounded-full border-2" style={{ borderColor: late ? AMBER : LIME }} />
        <span className="animate-pop relative grid size-28 place-items-center rounded-full" style={{ background: late ? AMBER : LIME, boxShadow: `0 0 60px ${late ? AMBER : LIME}66` }}>
          <svg viewBox="0 0 34 34" className="size-14" aria-hidden="true">
            <path d="M8 17.5 L14.5 24 L26.5 11" fill="none" stroke={late ? '#3b2600' : '#1c3306'} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={48} className="animate-draw" />
          </svg>
        </span>
      </div>
      <p className="animate-float-up mt-2 text-sm font-semibold tracking-wide text-white/60 uppercase">Absen tercatat</p>
      <p className="animate-float-up text-[64px] leading-none font-extrabold tracking-tight tabular" style={{ animationDelay: '220ms' }}>
        {timeOf(day.clockedAt, data.timezone)}
      </p>
      <span
        className={cx('animate-float-up mt-4 rounded-full px-4 py-2 text-sm font-bold', late ? 'bg-[#f5a524]/20 text-[#ffc861]' : 'bg-[var(--lime)]/15 text-[var(--lime)]')}
        style={{ animationDelay: '300ms' }}
      >
        {lateLabel(day.lateMinutes)} · jam masuk {data.startTime}
      </span>
      {day.distanceM !== null && (
        <p className="animate-float-up mt-3 text-sm text-white/55" style={{ animationDelay: '360ms' }}>
          Tercatat {day.distanceM} m dari titik toko
        </p>
      )}
      <div className="animate-float-up mt-10 flex w-full flex-col gap-3" style={{ animationDelay: '420ms' }}>
        <button onClick={onContinue} className="press flex h-16 items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] text-lg font-extrabold text-[var(--lime-ink)]">
          Lanjut ke Stock Opname <ArrowRight className="size-5" />
        </button>
        <button onClick={onClose} className="press h-12 rounded-2xl text-sm font-semibold text-white/70">
          Lihat ringkasan absen
        </button>
      </div>
    </div>
  );
}
