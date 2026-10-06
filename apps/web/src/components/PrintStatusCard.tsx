import { AlertTriangle, CheckCircle2, Loader2, Printer, RotateCcw, Settings } from 'lucide-react';
import { Link } from 'react-router';
import { usePrintStatus } from '../printing/service';
import { Button } from './ui';

/** Status cetak terakhir: berhasil / terkirim / gagal + tombol Coba lagi. */
export function PrintStatusCard() {
  const status = usePrintStatus();
  if (status.state === 'idle') return null;

  if (status.state === 'printing') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
        <Loader2 className="size-6 animate-spin text-fg-muted" />
        <span className="font-semibold">Mencetak {status.label}…</span>
      </div>
    );
  }

  if (status.state === 'done') {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-success/10 p-4 text-success">
        {status.confirmed ? <CheckCircle2 className="size-6 shrink-0" /> : <Printer className="size-6 shrink-0" />}
        <div>
          <p className="font-semibold">{status.confirmed ? 'Data diterima jalur printer' : 'Data diserahkan ke jalur cetak'}</p>
          <p className="text-sm">{status.message}</p>
          <p className="mt-1 text-xs">Periksa hasil pada printer; keluarnya kertas belum dapat dipastikan dari web.</p>
        </div>
      </div>
    );
  }

  const title =
    status.code === 'not-paired' ? 'Printer belum dipilih' : status.code === 'unavailable' ? 'Printer tidak terdeteksi' : status.code === 'unsupported' ? 'Jalur cetak tidak didukung' : 'Gagal mencetak';
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-danger">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-6 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm">{status.message}</p>
          <p className="mt-1 text-sm">Transaksi tetap tersimpan. Struk bisa dicetak ulang dari Riwayat.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="danger" icon={<RotateCcw className="size-5" />} onClick={() => void status.retry()}>
          Coba lagi
        </Button>
        <Link to="/printer">
          <Button variant="outline" icon={<Settings className="size-5" />}>
            Pengaturan printer
          </Button>
        </Link>
      </div>
    </div>
  );
}
