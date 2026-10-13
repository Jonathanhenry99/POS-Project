import { ShieldQuestion } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '../../components/feedback';
import { Button } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';

interface PendingApproval {
  id: string;
  reason: string;
  code: string;
  requestedByName: string;
  deviceName: string;
  expiresAt: string;
}

const POLL_MS = 8000;

/**
 * Permintaan persetujuan dari kasir, tampil di atas semua halaman admin selama owner membuka dashboard.
 * Owner menyetujui/menolak di sini, atau membacakan kodenya ke kasir.
 */
export function ApprovalBanner() {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api<PendingApproval[]>('/approvals/pending').then(setItems, () => undefined), []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS);
    const onShow = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load]);

  const decide = async (item: PendingApproval, approve: boolean) => {
    setBusy(item.id);
    try {
      await api(`/approvals/${item.id}/decide`, { method: 'POST', body: { approve } });
      toast(approve ? 'Disetujui. Tablet kasir lanjut sendiri.' : 'Ditolak.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
      void load();
    }
  };

  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3" role="region" aria-label="Permintaan persetujuan dari kasir">
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <ShieldQuestion className="size-6 shrink-0 text-warning" />
          <div className="min-w-56 flex-1">
            <p className="font-semibold">
              {item.requestedByName} minta persetujuan <span className="font-normal text-fg-muted">· {item.deviceName}</span>
            </p>
            <p className="text-sm">{item.reason}</p>
            <p className="mt-1 text-xs text-fg-muted">
              Kode untuk kasir: <b className="tracking-widest text-fg tabular">{item.code.slice(0, 3)} {item.code.slice(3)}</b>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy === item.id} onClick={() => void decide(item, false)}>
              Tolak
            </Button>
            <Button variant="success" loading={busy === item.id} onClick={() => void decide(item, true)}>
              Setujui
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
