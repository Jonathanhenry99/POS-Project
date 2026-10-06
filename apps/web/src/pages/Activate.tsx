import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button, ErrorNote, Field, TextInput } from '../components/ui';
import { toast } from '../components/feedback';
import { errorMessage } from '../lib/api';
import { pairDevice } from '../lib/session';
import { useApp } from '../lib/state';

/** Owner mengaktifkan tablet sebagai perangkat kasir (sekali saja, butuh internet). */
export function ActivatePage() {
  const mode = useApp((s) => s.mode);
  const [name, setName] = useState('Tablet Kasir');
  const [username, setUsername] = useState('owner');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (mode === 'tablet') return <Navigate to="/login" replace />;

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
      <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <Link to="/login" className="flex items-center gap-1 text-sm font-semibold text-stone-600">
          <ArrowLeft className="size-4" /> Kembali
        </Link>
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-8 text-emerald-600" />
          <h1 className="text-xl font-bold">Aktifkan tablet kasir</h1>
        </div>
        <p className="text-sm text-stone-600">
          Setelah aktif, tablet ini bisa dipakai berjualan dan mencetak struk walau internet putus. Kasir cukup login dengan PIN. Hanya owner
          yang bisa mengaktifkan.
        </p>
        <Field label="Nama perangkat">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
        <Field label="Username owner">
          {(id) => <TextInput id={id} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />}
        </Field>
        <Field label="PIN owner">
          {(id) => (
            <TextInput
              id={id}
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          )}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" size="lg" variant="success" loading={busy} disabled={pin.length < 4}>
          Aktifkan perangkat
        </Button>
      </form>
    </div>
  );
}
