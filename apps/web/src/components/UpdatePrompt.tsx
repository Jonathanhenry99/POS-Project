import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { appStore } from '../lib/state';
import { Button } from './ui';

/**
 * Versi baru aplikasi. Tablet kasir dan owner diberi tombol "Perbarui" (tidak memuat ulang sendiri agar transaksi
 * atau isian yang belum disimpan tidak hilang). HP karyawan (barista/kitchen) dan layar login langsung diperbarui:
 * drafnya tersimpan otomatis, dan fitur baru harus sampai tanpa mereka perlu tahu soal tombol.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => Promise<void>)>(null);
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh: () => {
        const s = appStore.get();
        if (s.mode !== 'tablet' && s.user?.role !== 'owner') void updateSW(true);
        else setUpdate(() => () => updateSW(true));
      },
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        // Cek versi baru tiap 30 menit, dan setiap kali aplikasi dibuka lagi dari latar belakang.
        setInterval(() => void reg.update(), 30 * 60_000);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update());
      },
    });
  }, []);
  if (!update) return null;
  return (
    <div className="fixed bottom-4 left-4 z-30 flex items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-white shadow-xl">
      <span className="text-sm font-semibold">Versi baru aplikasi tersedia.</span>
      <Button size="sm" variant="warning" icon={<RefreshCw className="size-4" />} onClick={() => void update()}>
        Perbarui
      </Button>
    </div>
  );
}
