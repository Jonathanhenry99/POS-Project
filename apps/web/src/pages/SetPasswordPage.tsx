import { KeyRound, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BrandLogo } from '../components/BrandLogo';
import { NewPasswordFields, passwordReady } from '../components/PasswordFields';
import { toast } from '../components/feedback';
import { Button, ErrorNote } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { logout, replaceSessionToken } from '../lib/session';
import { useApp } from '../lib/state';

/**
 * Langkah wajib sekali untuk owner: setelah masuk dengan PIN, buat kata sandi untuk login online.
 * Sesudahnya login online owner memakai kata sandi; PIN tetap untuk tablet kasir.
 */
export function SetPasswordPage() {
  const user = useApp((s) => s.user)!;
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>('/auth/password', { method: 'POST', body: { password } });
      replaceSessionToken(token, { mustSetPassword: false });
      toast('Kata sandi dibuat. Login online berikutnya memakai kata sandi ini.');
      navigate('/admin', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        className="animate-rise flex w-full max-w-md flex-col gap-5 rounded-3xl border border-line bg-surface p-6 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (passwordReady(password, confirm, user.username)) void save();
        }}
      >
        <div className="flex items-center gap-3">
          <BrandLogo className="h-12 w-14 rounded-2xl" />
          <div>
            <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Langkah keamanan</p>
            <h1 className="text-xl font-extrabold tracking-tight">Buat kata sandi owner</h1>
          </div>
        </div>
        <p className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3 text-sm text-fg-muted">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>
            Akun owner memegang semua data toko, jadi login dari HP/laptop memakai kata sandi, bukan PIN. <b className="text-fg">PIN owner tetap dipakai di tablet kasir</b> seperti biasa.
          </span>
        </p>
        <NewPasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} username={user.username} />
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" size="lg" loading={busy} disabled={!passwordReady(password, confirm, user.username)}>
          Simpan kata sandi
        </Button>
        <button
          type="button"
          className="flex items-center justify-center gap-2 text-sm font-semibold text-fg-muted"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut className="size-4" /> Keluar dulu
        </button>
      </form>
    </div>
  );
}
