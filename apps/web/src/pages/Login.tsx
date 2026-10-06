import { ArrowLeft, Coffee, Tablet } from 'lucide-react';
import { useState } from 'react';
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
    <>
      {!window.isSecureContext && (
        <p className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
          Aplikasi dibuka lewat HTTP biasa. Login PIN offline dan mode aplikasi (PWA) butuh HTTPS. Gunakan alamat https:// dari server.
        </p>
      )}
      {mode === 'tablet' ? <TabletLogin /> : <OnlineLogin />}
    </>
  );
}

function Brand() {
  const name = useApp((s) => s.data?.settings.store.name);
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-900 text-brand-100">
        <Coffee className="size-7" />
      </span>
      <div>
        <p className="text-xl font-extrabold tracking-tight">{name || 'Mourden POS'}</p>
        <p className="text-sm text-stone-500">Kasir cafe</p>
      </div>
    </div>
  );
}

const NO_USERS: CachedUser[] = [];

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
    <div className="flex h-full flex-col bg-stone-100 lg:flex-row">
      <div className="flex flex-col gap-6 p-6 lg:w-[55%] lg:p-10">
        <Brand />
        <div>
          <h1 className="text-2xl font-bold">Siapa yang bertugas?</h1>
          <p className="text-stone-500">Perangkat: {deviceName}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setSelected(u);
                setError('');
              }}
              className={cx(
                'flex min-h-24 flex-col items-start justify-between rounded-2xl border-2 bg-white p-4 text-left',
                selected?.id === u.id ? 'border-brand-700 ring-4 ring-brand-100' : 'border-transparent',
              )}
            >
              <span className="text-lg font-bold">{u.name}</span>
              <span className="text-sm text-stone-500">{ROLE_LABEL[u.role]}</span>
            </button>
          ))}
        </div>
        {!users.length && <ErrorNote>Data pengguna belum ada. Sambungkan tablet ke internet sekali untuk mengunduh data.</ErrorNote>}
      </div>
      <div className="flex flex-1 items-center justify-center bg-white p-6">
        {selected ? (
          <div className="w-full">
            <p className="mb-4 text-center text-lg">
              PIN untuk <b>{selected.name}</b>
            </p>
            <PinPad key={selected.id} onSubmit={submit} busy={busy} error={error} />
          </div>
        ) : (
          <p className="text-stone-500">Pilih nama Anda terlebih dahulu.</p>
        )}
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
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-sm">
        <Brand />
        <h1 className="mt-6 mb-4 text-xl font-bold">Masuk</h1>
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
          <>
            <button className="mb-3 flex items-center gap-1 text-sm font-semibold text-stone-600" onClick={() => setStep('user')}>
              <ArrowLeft className="size-4" /> {username}
            </button>
            <PinPad onSubmit={submit} busy={busy} error={error} />
          </>
        )}
        <Link to="/aktivasi" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-brand-700">
          <Tablet className="size-4" /> Jadikan perangkat ini tablet kasir
        </Link>
      </div>
    </div>
  );
}
