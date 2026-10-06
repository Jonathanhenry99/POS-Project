import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { PublicUser } from '@mourden/shared';
import { verifyOwnerPin } from '../lib/session';
import { Modal, PinPad } from './ui';

/** Minta PIN owner untuk menyetujui aksi (void, diskon besar). Dicek di tablet, bisa offline. */
export function OwnerApproval({ reason, onApproved, onClose }: { reason: string; onApproved: (owner: PublicUser) => void; onClose: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
    </Modal>
  );
}
