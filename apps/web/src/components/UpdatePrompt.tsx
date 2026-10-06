import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from './ui';

/** Muncul saat versi baru aplikasi tersedia. Tidak memuat ulang sendiri agar transaksi tidak terganggu. */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => Promise<void>)>(null);
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh: () => setUpdate(() => () => updateSW(true)),
      onRegisteredSW(_url, reg) {
        // Cek versi baru tiap 30 menit.
        if (reg) setInterval(() => void reg.update(), 30 * 60_000);
      },
    });
  }, []);
  if (!update) return null;
  return (
    <div className="fixed bottom-4 left-4 z-30 flex items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-xl">
      <span className="text-sm font-semibold">Versi baru aplikasi tersedia.</span>
      <Button size="sm" variant="warning" icon={<RefreshCw className="size-4" />} onClick={() => void update()}>
        Perbarui
      </Button>
    </div>
  );
}
