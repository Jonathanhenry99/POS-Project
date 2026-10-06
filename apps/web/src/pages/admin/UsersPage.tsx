import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { ROLE_LABEL, type PublicUser, type Role } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { Badge, Button, ErrorNote, Field, Modal, Segmented, Spinner, TextInput, Toggle } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { refreshBootstrap } from '../../lib/sync';
import { PageHeader } from './AdminRoutes';
import { useApi } from './hooks';

const ROLE_HINT: Record<Role, string> = {
  owner: 'Semua akses: laporan, menu, stok, pengaturan.',
  kasir: 'Layar kasir, riwayat, void, tutup kasir. Hanya di tablet kasir.',
  barista: 'Stock opname & catat barang bar. Bisa dari HP sendiri.',
  kitchen: 'Stock opname & catat barang dapur. Bisa dari HP sendiri.',
};

export function UsersPage() {
  const { data, error, loading, reload } = useApi<PublicUser[]>('/users');
  const [editing, setEditing] = useState<PublicUser | 'new' | null>(null);
  return (
    <div className="p-4">
      <PageHeader title="Pengguna" subtitle="Setiap orang punya PIN sendiri supaya riwayat transaksi & opname jelas siapa pelakunya.">
        <Button icon={<Plus className="size-5" />} onClick={() => setEditing('new')}>
          Tambah pengguna
        </Button>
      </PageHeader>
      <ErrorNote>{error}</ErrorNote>
      {loading && !data && <Spinner className="mx-auto my-10" />}
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {data?.map((u) => (
          <li key={u.id}>
            <button onClick={() => setEditing(u)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50">
              <div>
                <p className="font-semibold">
                  {u.name} {!u.active && <Badge>Nonaktif</Badge>}
                </p>
                <p className="text-sm text-stone-500">@{u.username}</p>
              </div>
              <Badge tone={u.role === 'owner' ? 'blue' : 'stone'}>{ROLE_LABEL[u.role]}</Badge>
            </button>
          </li>
        ))}
      </ul>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user: PublicUser | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'kasir');
  const [active, setActive] = useState(user?.active ?? true);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinValid = /^\d{4,6}$/.test(pin);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (user) await api(`/users/${user.id}`, { method: 'PATCH', body: { name, role, active, ...(pin ? { pin } : {}) } });
      else await api('/users', { method: 'POST', body: { name, username, role, pin } });
      toast('Pengguna disimpan');
      // Tablet kasir perlu PIN terbaru untuk login offline.
      void refreshBootstrap();
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Ubah ${user.name}` : 'Pengguna baru'}
      footer={
        <Button className="flex-1" size="lg" loading={busy} disabled={!name.trim() || (!user && (!username.trim() || !pinValid)) || (!!pin && !pinValid)} onClick={submit}>
          Simpan
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nama (tampil di struk & login)">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        {!user && (
          <Field label="Username" hint="Huruf kecil/angka, dipakai login di HP.">
            {(id) => <TextInput id={id} autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} />}
          </Field>
        )}
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Peran</p>
          <Segmented value={role} onChange={setRole} options={(['kasir', 'barista', 'kitchen', 'owner'] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          <p className="mt-1 text-xs text-stone-500">{ROLE_HINT[role]}</p>
        </div>
        <Field label={user ? 'PIN baru (kosongkan bila tidak diganti)' : 'PIN (4-6 angka)'}>
          {(id) => (
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
              <TextInput id={id} className="pl-10" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
        </Field>
        {user && <Toggle checked={active} onChange={setActive} label="Aktif" description="Pengguna nonaktif tidak bisa login." />}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
