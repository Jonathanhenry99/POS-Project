import { Download, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isAppMode, promptInstall, useInstallPrompt, useJustInstalled } from '../lib/install';
import { toast } from './feedback';

/**
 * Di tab Chrome: tombol "Instal" (POS jadi aplikasi layar penuh tanpa address bar),
 * atau tombol layar penuh sementara bila instal belum tersedia. Disembunyikan saat sudah mode aplikasi.
 */
export function AppModeButton() {
  const prompt = useInstallPrompt();
  const installed = useJustInstalled();
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (isAppMode()) return null;
  const cls = 'press flex h-11 items-center gap-2 rounded-xl bg-white/12 px-3 text-sm font-semibold hover:bg-white/20';

  if (prompt && !installed) {
    return (
      <button
        className={cls}
        onClick={async () => {
          if (await promptInstall()) toast('Aplikasi terpasang. Buka Mourden POS dari ikon di layar utama.');
        }}
      >
        <Download className="size-5" /> Instal aplikasi
      </button>
    );
  }
  if (!document.fullscreenEnabled) return null;
  return (
    <button
      className={cls}
      title={full ? 'Keluar layar penuh' : 'Layar penuh'}
      aria-label={full ? 'Keluar layar penuh' : 'Layar penuh'}
      onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
    >
      {full ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
    </button>
  );
}
