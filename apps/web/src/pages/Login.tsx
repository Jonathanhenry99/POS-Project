import { ArrowLeft, CloudOff, Printer, ShieldCheck, Tablet } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ROLE_LABEL, type CachedUser } from '@mourden/shared';
import { Button, ErrorNote, Field, PinPad, TextInput, cx } from '../components/ui';
import { errorMessage } from '../lib/api';
import { loginOnline, loginTablet } from '../lib/session';
import { useApp } from '../lib/state';

export function LoginPage() {
  const mode = useApp((s) => s.mode);
  const user = useApp((s) => s.user);
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="flex h-full flex-col">
      {!window.isSecureContext && (
        <p className="bg-danger px-4 py-2 text-center text-sm font-semibold text-white">
          Aplikasi dibuka lewat HTTP biasa. Login PIN offline dan mode aplikasi (PWA) butuh HTTPS. Gunakan alamat https:// dari server.
        </p>
      )}
      <div className="min-h-0 flex-1">{mode === 'tablet' ? <TabletLogin /> : <OnlineLogin />}</div>
    </div>
  );
}

/** Panel biru bergradien dengan identitas toko (sisi kiri layar login). */
function Hero({ children }: { children?: ReactNode }) {
  const name = useApp((s) => s.data?.settings.store.name);
  return (
    <div className="bg-grad-header relative flex w-full flex-col justify-between overflow-hidden p-8 text-white lg:p-10">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-[#ff7a1a]/25 blur-3xl" />
      <div className="pointer-events-none absolute -top-20 -left-10 size-72 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <BrandLogo className="h-16 w-20 rounded-2xl p-1.5 shadow-lg" />
        <div>
          <p className="text-2xl font-extrabold tracking-tight">{name || 'Mourden'}</p>
          <p className="text-sm text-white/75">Point of Sale</p>
        </div>
      </div>
      <div className="relative mt-10 hidden lg:block">
        <p className="text-4xl leading-tight font-extrabold tracking-tight">
          Kasir cepat,
          <br />
          struk langsung keluar.
        </p>
        <ul className="mt-6 flex flex-col gap-3 text-white/90">
          <Feature icon={<Printer className="size-5" />}>Satu sentuhan cetak, tanpa dialog</Feature>
          <Feature icon={<CloudOff className="size-5" />}>Tetap jualan saat internet putus</Feature>
          <Feature icon={<ShieldCheck className="size-5" />}>PIN per kasir, semua tercatat</Feature>
        </ul>
      </div>
      {children}
    </div>
  );
}

function Feature({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">{icon}</span>
      {children}
    </li>
  );
}

const NO_USERS: CachedUser[] = [];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Tablet: pilih nama lalu masukkan PIN (dicek di tablet, bisa offline). */
function TabletLogin() {
  const users = useApp((s) => s.data?.users) ?? NO_USERS;
  const deviceName = useApp((s) => s.device?.name);
  const [selected, setSelected] = useState<CachedUser | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (pin: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await loginTablet(selected.id, pin);
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full lg:grid-cols-[minmax(360px,36%)_1fr]">
      <Hero>
        <p className="relative mt-6 text-sm text-white/70">Perangkat: {deviceName}</p>
      </Hero>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-6 lg:flex-row lg:items-center lg:p-8">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Siapa yang bertugas?</h1>
          <p className="mb-4 text-fg-muted">Pilih nama, lalu masukkan PIN.</p>
          <div className="grid grid-cols-2 gap-3">
            {users.map((u, i) => (
              <button
                key={u.id}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => {
                  setSelected(u);
                  setError('');
                }}
                className={cx(
                  'press animate-rise flex items-center gap-3 rounded-2xl border-2 bg-surface p-3 text-left shadow-card',
                  selected?.id === u.id ? 'border-primary ring-4 ring-primary/15' : 'border-transparent hover:border-line-strong',
                )}
              >
                <span
                  className={cx(
                    'grid size-12 shrink-0 place-items-center rounded-2xl text-base font-extrabold',
                    selected?.id === u.id ? 'bg-grad-primary text-white' : 'bg-primary/10 text-primary',
                  )}
                >
                  {initials(u.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{u.name}</span>
                  <span className="block text-sm text-fg-muted">{ROLE_LABEL[u.role]}</span>
                </span>
              </button>
            ))}
          </div>
          {!users.length && <ErrorNote>Data pengguna belum ada. Sambungkan tablet ke internet sekali untuk mengunduh data.</ErrorNote>}
        </div>
        <div className="w-full shrink-0 rounded-3xl border border-line bg-surface p-6 shadow-card lg:w-[340px]">
          {selected ? (
            <div key={selected.id} className="animate-fade-in">
              <p className="mb-4 text-center text-lg">
                PIN untuk <b>{selected.name}</b>
              </p>
              <PinPad onSubmit={submit} busy={busy} error={error} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-fg-muted">
              <span className="grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
                <ShieldCheck className="size-8" />
              </span>
              Pilih nama Anda terlebih dahulu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** HP/laptop owner & barista: username + PIN dicek di server. */
function OnlineLogin() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'user' | 'pin'>('user');
  const navigate = useNavigate();

  const submit = async (pin: string) => {
    setBusy(true);
    setError('');
    try {
      await loginOnline(username.trim(), pin);
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full lg:grid-cols-[minmax(380px,45%)_1fr]">
      <div className="hidden lg:flex">
        <Hero />
      </div>
      <div className="flex min-h-full items-center justify-center overflow-y-auto p-4">
        <div className="animate-rise w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-card">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BrandLogo className="h-12 w-16 rounded-2xl" />
            <p className="text-xl font-extrabold tracking-tight">Mourden POS</p>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Masuk</h1>
          <p className="mb-5 text-sm text-fg-muted">Owner, barista, dan kitchen login di sini.</p>
          {step === 'user' ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (username.trim()) setStep('pin');
              }}
            >
              <Field label="Username">
                {(id) => <TextInput id={id} autoFocus autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />}
              </Field>
              <Button type="submit" size="lg" disabled={!username.trim()}>
                Lanjut
              </Button>
            </form>
          ) : (
            <div className="animate-fade-in">
              <button className="mb-3 flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg" onClick={() => setStep('user')}>
                <ArrowLeft className="size-4" /> {username}
              </button>
              <PinPad onSubmit={submit} busy={busy} error={error} />
            </div>
          )}
          <Link to="/aktivasi" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
            <Tablet className="size-4" /> Jadikan perangkat ini tablet kasir
          </Link>
        </div>
      </div>
    </div>
  );
}
