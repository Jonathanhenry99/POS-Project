import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { PasswordInput } from '../components/PasswordFields';
import { Button, ErrorNote, Field, TextInput } from '../components/ui';
import { toast } from '../components/feedback';
import { errorMessage } from '../lib/api';
import { pairDevice } from '../lib/session';
import { useApp } from '../lib/state';

/** Owner mengaktifkan tablet sebagai perangkat kasir (sekali saja, butuh internet). */
export function ActivatePage() {
  const mode = useApp((s) => s.mode);
  // Tablet yang aksesnya dicabut server boleh diaktifkan ulang dari sini; data lokalnya tidak dihapus.
  const rejected = useApp((s) => !!s.dataError?.rejected);
  const [name, setName] = useState('Tablet Kasir');
  const [username, setUsername] = useState('owner');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (mode === 'tablet' && !rejected && !busy) return <Navigate to="/login" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const device = await pairDevice(username.trim(), pin, name.trim());
      toast(`Perangkat aktif (kode ${device.code})`);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-surface p-6 shadow-sm">
        <Link to="/login" className="flex items-center gap-1 text-sm font-semibold text-fg-muted">
          <ArrowLeft className="size-4" /> Kembali
        </Link>
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-8 text-success" />
          <h1 className="text-xl font-bold">{rejected ? 'Aktifkan ulang tablet kasir' : 'Aktifkan tablet kasir'}</h1>
        </div>
        {rejected && (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            Akses tablet ini di server sudah dicabut. Setelah diaktifkan ulang, menu dan pengaturan terbaru langsung diambil. Transaksi yang tersimpan di tablet tidak dihapus.
          </p>
        )}
        <p className="text-sm text-fg-muted">
          Setelah aktif, tablet ini bisa dipakai berjualan dan mencetak struk walau internet putus. Kasir cukup login dengan PIN. Hanya owner
          yang bisa mengaktifkan.
        </p>
        <Field label="Nama perangkat">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
        <Field label="Username owner">
          {(id) => <TextInput id={id} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />}
        </Field>
        <Field label="PIN atau kata sandi owner" hint="Owner yang sudah membuat kata sandi wajib memakai kata sandi.">
          {(id) => <PasswordInput id={id} autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} required />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" size="lg" variant="success" loading={busy} disabled={pin.length < 4}>
          Aktifkan perangkat
        </Button>
      </form>
    </div>
  );
}
