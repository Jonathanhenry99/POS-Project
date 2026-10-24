import { Camera, CameraOff, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { compressSelfie } from '../lib/photo';
import { cx } from './ui';

/** Ukuran foto yang diambil dari video; sama kecilnya dengan selfie dari kamera bawaan. */
const SIDE = 640;
const QUALITY = 0.72;

type CamState = 'starting' | 'live' | 'blocked';

/**
 * Kamera depan langsung di halaman (bukan memilih dari galeri), dengan bingkai bundar dan pemandu wajah.
 * Bila browser menolak kamera, tersedia jalan cadangan lewat kamera bawaan HP.
 */
export function SelfieCamera({ photo, onPhoto, size = 288, dark = false }: { photo: string; onPhoto: (dataUrl: string) => void; size?: number; dark?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CamState>('starting');
  const [flash, setFlash] = useState(0);
  const [error, setError] = useState('');

  // Kamera hanya menyala selama belum ada foto; setelah difoto, kamera dimatikan agar hemat baterai.
  useEffect(() => {
    if (photo) return;
    let stream: MediaStream | null = null;
    let live = true;
    setState('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('blocked');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
        setState('live');
      })
      .catch(() => live && setState('blocked'));
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [photo]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // Potong persegi di tengah lalu cerminkan, sama seperti yang terlihat di layar.
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(SIDE, side);
    const g = canvas.getContext('2d')!;
    g.translate(canvas.width, 0);
    g.scale(-1, 1);
    g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    setFlash((n) => n + 1);
    navigator.vibrate?.(25);
    onPhoto(canvas.toDataURL('image/jpeg', QUALITY));
  };

  const fromFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      onPhoto(await compressSelfie(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const ring = size + 22;
  return (
    <div className="flex flex-col items-center gap-5">
      <input ref={file} type="file" accept="image/*" capture="user" className="hidden" aria-label="Kamera selfie" onChange={(e) => void fromFile(e.target.files?.[0])} />
      <div className="relative grid place-items-center" style={{ width: ring, height: ring }}>
        {/* Cincin pemandu: berputar pelan saat kamera hidup, diam setelah foto diambil. */}
        <div
          aria-hidden="true"
          className={cx('absolute inset-0 rounded-full', !photo && state === 'live' && 'animate-orbit')}
          style={{ background: photo ? 'conic-gradient(#c8f465, #c8f465)' : 'conic-gradient(from 0deg, #c8f465, rgb(200 244 101 / 0) 30%, #7c5ce0 55%, rgb(124 92 224 / 0) 80%, #c8f465)' }}
        />
        <div className={cx('relative overflow-hidden rounded-full', dark ? 'bg-[#0d1210]' : 'bg-surface-3')} style={{ width: size, height: size }}>
          {photo ? (
            <img key={photo} src={photo} alt="Selfie" className="animate-pop size-full object-cover" />
          ) : (
            <>
              <video ref={video} playsInline muted className={cx('size-full -scale-x-100 object-cover transition-opacity duration-500', state === 'live' ? 'opacity-100' : 'opacity-0')} />
              {state === 'live' && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-[50%] border-2 border-dashed border-white/45" />
              )}
              {state !== 'live' && (
                <div className={cx('absolute inset-0 grid place-items-center p-6 text-center', dark ? 'text-white/70' : 'text-fg-muted')}>
                  {state === 'starting' ? (
                    <span className="flex flex-col items-center gap-2 text-sm">
                      <Camera className="size-8 animate-pulse" />
                      Membuka kamera...
                    </span>
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-sm">
                      <CameraOff className="size-8" />
                      Kamera belum diizinkan
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {flash > 0 && <div key={flash} aria-hidden="true" className="animate-flash pointer-events-none absolute inset-0 bg-white opacity-0" />}
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {!photo && state === 'live' && (
        <button
          aria-label="Ambil foto"
          onClick={shoot}
          className={cx('press group grid size-20 place-items-center rounded-full border-4 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)]', dark ? 'border-white/90 bg-white/10' : 'border-[var(--ink)] bg-surface')}
        >
          <span className={cx('size-14 rounded-full transition-transform group-active:scale-90', dark ? 'bg-white' : 'bg-[var(--ink)]')} />
        </button>
      )}
      {!photo && state === 'blocked' && (
        <button onClick={() => file.current?.click()} className="press flex h-14 items-center gap-2 rounded-2xl bg-[var(--lime)] px-6 font-bold text-[var(--lime-ink)]">
          <Camera className="size-5" /> Buka kamera HP
        </button>
      )}
      {photo && (
        <button onClick={() => onPhoto('')} className={cx('press flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold', dark ? 'bg-white/10 text-white' : 'bg-surface-2 text-fg')}>
          <RotateCcw className="size-4" /> Ulangi foto
        </button>
      )}
    </div>
  );
}
