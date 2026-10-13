import { Clock, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PublicUser } from '@mourden/shared';
import { api, errorMessage } from '../lib/api';
import { uuid } from '../lib/id';
import { verifyOwnerPin } from '../lib/session';
import { useApp } from '../lib/state';
import { Button, ErrorNote, Modal, PinPad, Spinner } from './ui';

type RemoteStatus = 'pending' | 'approved' | 'rejected' | 'expired';
interface RemoteResult {
  status: RemoteStatus;
  approver: PublicUser | null;
}

/**
 * Persetujuan owner untuk aksi berisiko (void, diskon besar, komplimen di atas jatah).
 * Owner di tempat: PIN owner, dicek di tablet dan bisa offline.
 * Owner tidak di tempat: permintaan dikirim ke dashboard/WhatsApp owner, tablet menunggu jawabannya.
 */
export function OwnerApproval({ reason, onApproved, onClose }: { reason: string; onApproved: (owner: PublicUser) => void; onClose: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<{ id: string; expiresAt: string } | null>(null);
  const online = useApp((s) => s.online);
  // Simulasi pratinjau tidak mengirim apa pun ke server, jadi jalur jarak jauh tidak tersedia di sana.
  const simulated = useApp((s) => s.preview && !s.previewLive);

  const askRemote = async () => {
    setBusy(true);
    setError('');
    try {
      setRemote(await api<{ id: string; expiresAt: string }>('/tablet/approvals', { method: 'POST', body: { id: uuid(), reason }, asDevice: true }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (remote) {
    return (
      <RemoteWait
        request={remote}
        reason={reason}
        onApproved={onApproved}
        onBack={(message) => {
          setRemote(null);
          setError(message);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal open size="sm" onClose={onClose} title="Persetujuan owner">
      <div className="mb-4 flex items-start gap-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">
        <ShieldCheck className="size-5 shrink-0" />
        <span>{reason}</span>
      </div>
      <PinPad
        submitLabel="Setujui"
        busy={busy}
        error={error}
        onSubmit={async (pin) => {
          setBusy(true);
          setError('');
          const owner = await verifyOwnerPin(pin);
          setBusy(false);
          if (owner) onApproved(owner);
          else setError('PIN owner salah');
        }}
      />
      {!simulated && (
        <div className="mt-4 border-t border-line pt-3">
          <Button variant="outline" className="w-full" icon={<Smartphone className="size-5" />} loading={busy} disabled={!online} onClick={() => void askRemote()}>
            Owner tidak di tempat? Minta persetujuan
          </Button>
          <p className="mt-2 text-center text-xs text-fg-muted">{online ? 'Permintaan muncul di dashboard owner (dan WhatsApp bila diatur). Tanpa membagikan PIN.' : 'Butuh internet untuk meminta persetujuan jarak jauh.'}</p>
        </div>
      )}
    </Modal>
  );
}

function RemoteWait({ request, reason, onApproved, onBack, onClose }: { request: { id: string; expiresAt: string }; reason: string; onApproved: (owner: PublicUser) => void; onBack: (message: string) => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(() => secondsLeft(request.expiresAt));
  const done = useRef(false);

  const settle = (r: RemoteResult) => {
    if (done.current || r.status === 'pending') return;
    done.current = true;
    if (r.status === 'approved' && r.approver) onApproved(r.approver);
    else onBack(r.status === 'rejected' ? 'Permintaan ditolak owner.' : 'Waktu permintaan habis. Minta ulang bila masih perlu.');
  };

  useEffect(() => {
    const poll = () => api<RemoteResult>(`/tablet/approvals/${request.id}`, { asDevice: true }).then(settle, () => undefined);
    const tick = setInterval(() => {
      const s = secondsLeft(request.expiresAt);
      setLeft(s);
      if (s <= 0) settle({ status: 'expired', approver: null });
    }, 1000);
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      clearInterval(tick);
      clearInterval(timer);
    };
    // Satu putaran pemantauan per permintaan.
  }, [request.id, request.expiresAt]);

  const redeem = async () => {
    setBusy(true);
    setError('');
    try {
      settle(await api<RemoteResult>(`/tablet/approvals/${request.id}/redeem`, { method: 'POST', body: { code }, asDevice: true }));
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open size="sm" onClose={onClose} title="Menunggu owner">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          <ShieldCheck className="size-5 shrink-0" />
          <span>{reason}</span>
        </div>
        <div className="flex items-center gap-3">
          <Spinner />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Permintaan terkirim ke owner</p>
            <p className="text-sm text-fg-muted">Begitu owner menekan Setujui di dashboard, layar ini lanjut sendiri.</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-sm font-semibold tabular">
            <Clock className="size-4" />
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        </div>
        <div className="border-t border-line pt-3">
          <label htmlFor="approval-code" className="mb-1.5 block text-sm font-semibold text-fg-muted">
            Atau masukkan kode dari owner
          </label>
          <div className="flex gap-2">
            <input
              id="approval-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6 angka"
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-center text-xl font-semibold tracking-[0.3em] tabular outline-none placeholder:text-base placeholder:tracking-normal placeholder:text-fg-subtle focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <Button loading={busy} disabled={code.length !== 6} onClick={() => void redeem()}>
              Pakai kode
            </Button>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button variant="ghost" onClick={() => onBack('')}>
          Kembali ke PIN owner
        </Button>
      </div>
    </Modal>
  );
}

const secondsLeft = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
