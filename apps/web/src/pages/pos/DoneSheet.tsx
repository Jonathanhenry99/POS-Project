import { Printer } from 'lucide-react';
import { formatRupiah, ORDER_TYPE_LABEL, PAYMENT_LABEL } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { Button, Modal } from '../../components/ui';
import type { LocalOrder } from '../../lib/idb';
import { printOrder, usePrintStatus } from '../../printing/service';

/** Tanda centang yang "tergambar" (SVG stroke) dengan cincin denyut. */
function SuccessMark() {
  return (
    <div className="relative grid size-20 place-items-center">
      <span className="animate-ping-soft absolute inset-2 rounded-full bg-success/25" />
      <span className="animate-pop relative grid size-20 place-items-center rounded-full bg-grad-success shadow-[0_14px_30px_-10px_rgb(18_168_101/0.7)]">
        <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={48} className="animate-draw" />
        </svg>
      </span>
    </div>
  );
}

export function DoneSheet({ order, onClose }: { order: LocalOrder; onClose: () => void }) {
  const status = usePrintStatus();
  const printedOnce = status.state !== 'idle';
  return (
    <Modal open size="md" onClose={onClose}>
      <div className="flex flex-col items-center gap-2 pt-3 text-center">
        <SuccessMark />
        <p className="mt-2 text-xl font-extrabold tracking-tight">Pembayaran berhasil</p>
        <p className="text-fg-muted">
          {order.number} · {ORDER_TYPE_LABEL[order.orderType]} · {PAYMENT_LABEL[order.payment.method]} · {formatRupiah(order.total)}
        </p>
        {order.payment.method === 'cash' && (
          <div className="animate-rise mt-3 w-full rounded-3xl border border-success/30 bg-success/8 p-4">
            <p className="text-sm font-semibold text-success">Kembalian</p>
            <p className="text-[44px] leading-tight font-extrabold text-success tabular">{formatRupiah(order.payment.change)}</p>
            <p className="text-sm text-fg-muted">dari uang {formatRupiah(order.payment.tendered)}</p>
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
