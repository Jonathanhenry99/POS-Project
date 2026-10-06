import { useEffect, useRef } from 'react';
import { imageBytes, paperDots, toAscii, type ReceiptImage, type ReceiptOp } from '@mourden/shared';
import { cx } from './ui';

/** Pratinjau struk di layar: kertas putih, huruf mono, logo dari bitmap yang sama dengan yang dikirim ke printer. */
export function ReceiptPreview({ ops, width, className }: { ops: ReceiptOp[]; width: number; className?: string }) {
  return (
    <div
      className={cx('mx-auto rounded-lg bg-white px-3 py-4 font-mono text-[12px] leading-[1.4] text-[#1b1b1b] shadow-[0_6px_24px_-10px_rgb(0_0_0/0.35)] ring-1 ring-black/5', className)}
      style={{ width: `calc(${width}ch + 1.5rem)` }}
    >
      {ops.map((op, i) => {
        if (op.kind === 'text') {
          const text = toAscii(op.text).replace(/\n/g, ' ').slice(0, width) || ' ';
          return (
            <div
              key={i}
              className={cx('whitespace-pre', op.bold && 'font-bold', op.tall && 'flex h-[2.8em] items-center')}
              style={{ textAlign: op.align ?? 'left', justifyContent: op.align === 'center' ? 'center' : op.align === 'right' ? 'flex-end' : 'flex-start' }}
            >
              {op.tall ? <span className="inline-block origin-center scale-y-[1.8]">{text}</span> : text}
            </div>
          );
        }
        if (op.kind === 'image') return <Bitmap key={i} image={op.image} widthChars={width} />;
        if (op.kind === 'feed') return <div key={i} style={{ height: `${Math.min(op.lines, 4) * 1.4}em` }} />;
        return null;
      })}
    </div>
  );
}

function Bitmap({ image, widthChars }: { image: ReceiptImage; widthChars: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d')!;
    const px = g.createImageData(image.width, image.height);
    const bytes = imageBytes(image);
    const rowBytes = Math.ceil(image.width / 8);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const ink = bytes[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7));
        const v = ink ? 24 : 255;
        px.data.set([v, v, v, 255], (y * image.width + x) * 4);
      }
    }
    g.putImageData(px, 0, 0);
  }, [image]);
  // Skala sama dengan kertas: lebar teks (N karakter) = lebar titik cetak printer.
  return (
    <div className="flex justify-center pt-0.5 pb-2">
      <canvas ref={ref} aria-label="Logo struk" style={{ width: `${(image.width / paperDots(widthChars)) * widthChars}ch`, imageRendering: 'pixelated' }} />
    </div>
  );
}
