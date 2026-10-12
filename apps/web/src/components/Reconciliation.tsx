import { Banknote, CreditCard, QrCode } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatNumber, type Shift } from '@mourden/shared';
import { cx } from './ui';

/** Selisih = angka fisik/struk dikurangi catatan sistem. null = tidak diisi. */
function Status({ diff }: { diff: number | null }) {
  if (diff === null) return <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-bold text-fg-muted">Tidak diisi</span>;
  if (diff === 0) return <span className="rounded-full bg-success/12 px-2.5 py-1 text-xs font-bold text-success">Pas</span>;
  return (
    <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap tabular', diff < 0 ? 'bg-danger/12 text-danger' : 'bg-warning/15 text-[#8a5a00]')}>
      {diff < 0 ? 'Kurang' : 'Lebih'} {formatNumber(Math.abs(diff))}
    </span>
  );
}

/**
 * Pencocokan tutup kasir: uang tunai yang dihitung dan angka struk settlement EDC
 * dibandingkan dengan catatan sistem. Hanya untuk shift yang sudah ditutup.
 */
export function Reconciliation({ shift }: { shift: Shift }) {
  const s = shift.summary;
  if (!s || shift.countedCash === null) return null;
  const rows: { icon: ReactNode; label: string; actualLabel: string; actual: number | null; system: number }[] = [
    { icon: <Banknote className="size-[18px]" />, label: 'Tunai di laci', actualLabel: 'Dihitung', actual: shift.countedCash, system: s.expectedCash },
    { icon: <QrCode className="size-[18px]" />, label: 'QRIS', actualLabel: 'Settlement', actual: shift.settlement?.qris ?? null, system: s.byMethod.qris },
    { icon: <CreditCard className="size-[18px]" />, label: 'Debit / Kredit', actualLabel: 'Settlement', actual: shift.settlement?.card ?? null, system: s.byMethod.card },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="grid grid-cols-[1.3fr_1fr_1fr_7.5rem] items-center gap-x-3 bg-surface-2 px-3 py-2 text-[11px] font-bold tracking-wider text-fg-muted uppercase">
        <span>Pencocokan</span>
        <span className="text-right">Fisik / struk</span>
        <span className="text-right">Sistem</span>
        <span className="text-right">Hasil</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1.3fr_1fr_1fr_7.5rem] items-center gap-x-3 border-t border-line px-3 py-2.5 text-sm">
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="text-fg-muted">{r.icon}</span>
            <span className="truncate">{r.label}</span>
          </span>
          <span className="text-right tabular">{r.actual === null ? '–' : formatNumber(r.actual)}</span>
          <span className="text-right text-fg-muted tabular">{formatNumber(r.system)}</span>
          <span className="flex justify-end">
            <Status diff={r.actual === null ? (r.system === 0 ? 0 : null) : r.actual - r.system} />
          </span>
        </div>
      ))}
    </div>
  );
}
