import { Download, Maximize2, Minimize2, PlusSquare, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAppMode, isAppleMobile, promptInstall, useInstallPrompt, useJustInstalled } from '../lib/install';
import { toast } from './feedback';
import { Button, Modal, cx } from './ui';

/**
 * Chrome memakai prompt instal native; iPad/iPhone menampilkan panduan Layar Utama.
 * Tombol disembunyikan saat POS sudah dibuka sebagai aplikasi.
 */
export function AppModeButton({ light = false, allowFullscreen = true }: { light?: boolean; allowFullscreen?: boolean }) {
  const prompt = useInstallPrompt();
  const installed = useJustInstalled();
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (isAppMode()) return null;
  const cls = cx('press flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold', light ? 'border border-line bg-surface text-primary hover:bg-surface-2' : 'bg-white/12 hover:bg-white/20');

  if (isAppleMobile()) {
    return (
      <>
        <button className={cls} aria-label="Instal aplikasi" title="Instal aplikasi di iPad / iPhone" onClick={() => setGuide(true)}>
          <Download className="size-5" /><span className="hidden sm:inline">Instal aplikasi</span>
        </button>
        {guide && createPortal(
          <div className="workspace-theme text-fg">
            <Modal open onClose={() => setGuide(false)} title="Pasang di iPad / iPhone" footer={<Button className="w-full" onClick={() => setGuide(false)}>Mengerti</Button>}>
              <p className="mb-5 text-sm leading-relaxed text-fg-muted">Tambahkan Mourden POS ke Layar Utama agar bisa dibuka lewat ikon aplikasi. Di iPad dan iPhone, pemasangan dilakukan lewat menu browser.</p>
              <ol className="space-y-4 text-sm">
                <li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-bold text-primary">1</span><p>Buka alamat POS ini di <b>Safari</b>.</p></li>
                <li className="flex gap-3"><Share className="size-8 shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary" /><p>Ketuk <b>Bagikan</b> (kotak dengan panah ke atas) di toolbar Safari. Pada beberapa versi, buka menu <b>Lainnya (…)</b> terlebih dahulu.</p></li>
                <li className="flex gap-3"><PlusSquare className="size-8 shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary" /><p>Pilih <b>Tambahkan ke Layar Utama</b> / <b>Add to Home Screen</b>. Gulir menu atau ketuk <b>Lihat Selengkapnya</b> / <b>View More</b> jika perlu.</p></li>
                <li className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-bold text-primary">4</span><p>Aktifkan <b>Buka sebagai App</b> / <b>Open as Web App</b> jika tersedia, lalu ketuk <b>Tambah</b>. Buka ikon Mourden POS di Layar Utama.</p></li>
              </ol>
              <p className="mt-5 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">Jika membuka POS dari WhatsApp atau browser lain dan pilihan tersebut tidak muncul, salin alamatnya lalu buka di Safari.</p>
            </Modal>
          </div>, document.body,
        )}
      </>
    );
  }

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
  if (!allowFullscreen || !document.fullscreenEnabled) return null;
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
