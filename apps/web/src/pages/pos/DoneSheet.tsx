import { CheckCircle2, Printer } from 'lucide-react';
import { formatRupiah, PAYMENT_LABEL } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { Button, Modal } from '../../components/ui';
import type { LocalOrder } from '../../lib/idb';
import { printOrder, usePrintStatus } from '../../printing/service';

export function DoneSheet({ order, onClose }: { order: LocalOrder; onClose: () => void }) {
  const status = usePrintStatus();
  const printedOnce = status.state !== 'idle';
  return (
    <Modal open size="md" onClose={onClose}>
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <CheckCircle2 className="size-14 text-emerald-600" />
        <p className="text-xl font-bold">Pembayaran berhasil</p>
        <p className="text-stone-500">
          {order.number} · {PAYMENT_LABEL[order.payment.method]} · {formatRupiah(order.total)}
        </p>
        {order.payment.method === 'cash' && (
          <div className="mt-2 w-full rounded-2xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">Kembalian</p>
            <p className="text-4xl font-extrabold text-emerald-800 tabular">{formatRupiah(order.payment.change)}</p>
          </div>
        )}
      </div>
      <div className="mt-4">
        <PrintStatusCard />
      </div>
      <div className="mt-4 flex gap-3">
        <Button
          size="lg"
          variant="outline"
          icon={<Printer className="size-5" />}
          loading={status.state === 'printing'}
          onClick={() => void printOrder(order, { reprint: printedOnce })}
        >
          {printedOnce ? 'Cetak ulang' : 'Cetak struk'}
        </Button>
        <Button size="lg" className="flex-1" autoFocus onClick={onClose}>
          Pesanan baru
        </Button>
      </div>
    </Modal>
  );
}
