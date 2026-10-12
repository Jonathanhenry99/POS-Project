import { Gift, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ROLE_LABEL, formatRupiah, verifyPin, type CachedUser, type PublicUser } from '@mourden/shared';
import { OwnerApproval } from '../../components/OwnerApproval';
import { ErrorNote, Modal, PinPad, cx } from '../../components/ui';
import { compUsedToday } from '../../lib/pos';
import { useApp } from '../../lib/state';

/**
 * Komplimen karyawan: pilih penerima, penerima memasukkan PIN-nya sendiri (bukti ia yang mengambil),
 * lalu transaksi dicatat Rp 0 atas namanya. Melebihi jatah harian / batas harga butuh PIN owner.
 */
export function CompSheet({ qty, value, maxUnit, onClose, onConfirm }: { qty: number; value: number; maxUnit: number; onClose: () => void; onConfirm: (comp: { employeeId: string; approvedById: string | null }) => Promise<void> }) {
  const users = useApp((s) => s.data?.users ?? NO_USERS);
  const cfg = useApp((s) => s.data?.settings.comp) ?? { enabled: true, perDay: 1, maxUnitPrice: 0 };
  const [used, setUsed] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<CachedUser | null>(null);
  const [needOwner, setNeedOwner] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all(users.map(async (u) => [u.id, await compUsedToday(u.id)] as const)).then((rows) => live && setUsed(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
  }, [users]);

  const overPrice = cfg.maxUnitPrice > 0 && maxUnit > cfg.maxUnitPrice;
  const overQuota = (u: PublicUser) => (used[u.id] ?? 0) + qty > cfg.perDay;

  const finish = async (employee: CachedUser, owner: PublicUser | null) => {
    setBusy(true);
    setError('');
    try {
      await onConfirm({ employeeId: employee.id, approvedById: owner?.id ?? null });
    } catch (e) {
      setError((e as Error).message);
      setNeedOwner(false);
      setBusy(false);
    }
  };

  if (picked && needOwner) {
    return (
      <OwnerApproval
        reason={`${overQuota(picked) ? `Melebihi jatah ${picked.name} (${used[picked.id] ?? 0} dari ${cfg.perDay} sudah diambil hari ini).` : `Ada menu di atas ${formatRupiah(cfg.maxUnitPrice)}.`} Butuh persetujuan owner dan akan masuk daftar tinjau.`}
        onClose={() => setNeedOwner(false)}
        onApproved={(owner) => void finish(picked, owner)}
      />
    );
  }

  if (picked) {
    return (
      <Modal open size="sm" onClose={() => { setPicked(null); setError(''); }} dismissable={!busy} title={`PIN ${picked.name}`}>
        <p className="mb-4 flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
          <ShieldCheck className="size-5 shrink-0 text-primary" />
          <span>
            <b className="text-fg">{picked.name}</b> memasukkan PIN-nya sendiri untuk mengambil {qty} item ({formatRupiah(value)}). Tercatat atas namanya.
          </span>
        </p>
        <PinPad
          submitLabel="Konfirmasi"
          busy={busy}
          error={error}
          onSubmit={async (pin) => {
            setError('');
            // Di mode pratinjau hash PIN tidak tersedia; di tablet kasir PIN selalu diverifikasi.
            if (picked.pinHash && !(await verifyPin(pin, picked.pinHash))) return setError('PIN salah');
            if (overQuota(picked) || overPrice) setNeedOwner(true);
            else await finish(picked, null);
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal open size="md" onClose={onClose} title="Komplimen karyawan">
      <p className="mb-3 flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
        <Gift className="size-5 shrink-0 text-primary" />
        <span>
          {qty} item senilai <b className="text-fg">{formatRupiah(value)}</b> dicatat Rp 0 atas nama penerima. Bahan tetap terpotong dari stok, jadi tidak muncul sebagai selisih opname. Jatah: {cfg.perDay} item per orang per hari.
        </span>
      </p>
      <ErrorNote>{error}</ErrorNote>
      <p className="mt-2 mb-2 text-sm font-semibold text-fg-muted">Siapa yang mengambil?</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {users.map((u) => {
          const left = Math.max(0, cfg.perDay - (used[u.id] ?? 0));
          return (
            <li key={u.id}>
              <button onClick={() => { setError(''); setPicked(u); }} className="press flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-primary/50">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">{u.name.trim().slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.name}</span>
                  <span className="block text-xs text-fg-muted">{ROLE_LABEL[u.role]}</span>
                </span>
                <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap', left >= qty ? 'bg-success/12 text-success' : 'bg-warning/15 text-warning')}>
                  {left >= qty ? `Sisa ${left}` : left === 0 ? 'Jatah habis' : `Sisa ${left}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

const NO_USERS: CachedUser[] = [];
