import { useBrandLogo } from '../lib/brand';
import { cx } from './ui';

/** Logo toko di kotak putih (logo berlatar putih/transparan tetap terbaca di header biru). */
export function BrandLogo({ className }: { className?: string }) {
  const src = useBrandLogo();
  return (
    <span className={cx('grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-black/5', className)}>
      <img src={src} alt="Logo toko" draggable={false} className="max-h-full max-w-full object-contain" />
    </span>
  );
}
