// Toast dan dialog konfirmasi global.
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useState } from 'react';
import { createStore, useStore } from '../lib/store';
import { Button, Modal, cx } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const toastStore = createStore<{ items: Toast[] }>({ items: [] });
let nextId = 1;

export function toast(message: string, tone: ToastTone = 'success') {
  const id = nextId++;
  toastStore.set((s) => ({ items: [...s.items, { id, tone, message }].slice(-3) }));
  setTimeout(() => toastStore.set((s) => ({ items: s.items.filter((t) => t.id !== id) })), tone === 'error' ? 6000 : 3000);
}

export function Toaster() {
  const items = useStore(toastStore, (s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg',
            t.tone === 'success' && 'bg-emerald-700 text-white',
            t.tone === 'error' && 'bg-red-700 text-white',
            t.tone === 'info' && 'bg-stone-800 text-white',
          )}
        >
          {t.tone === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : t.tone === 'error' ? <AlertTriangle className="size-5 shrink-0" /> : <Info className="size-5 shrink-0" />}
          <span>{t.message}</span>
          <button aria-label="Tutup" className="-mr-1 grid size-8 place-items-center" onClick={() => toastStore.set((s) => ({ items: s.items.filter((x) => x.id !== t.id) }))}>
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

const confirmStore = createStore<{ req: ConfirmRequest | null }>({ req: null });

/** Konfirmasi hanya untuk aksi berisiko (hapus, void, keluar perangkat). */
export function confirmDialog(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) =>
    confirmStore.set({ req: { confirmLabel: 'Ya, lanjutkan', danger: false, ...opts, resolve } }),
  );
}

export function ConfirmHost() {
  const req = useStore(confirmStore, (s) => s.req);
  const [, force] = useState(0);
  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    confirmStore.set({ req: null });
    force((n) => n + 1);
  };
  return (
    <Modal
      open
      size="sm"
      onClose={() => close(false)}
      title={req.title}
      footer={
        <>
          <Button variant="outline" className="flex-1" onClick={() => close(false)}>
            Batal
          </Button>
          <Button variant={req.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => close(true)}>
            {req.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-stone-700">{req.message}</p>
    </Modal>
  );
}
