import { Banknote, CreditCard, Printer, QrCode } from 'lucide-react';
import { useState } from 'react';
import { cashSuggestions, formatNumber, formatRupiah, PAYMENT_LABEL, type PaymentMethod } from '@mourden/shared';
import { Button, ErrorNote, Modal, NumPad, applyNumKey, cx, inputClass } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import type { LocalOrder } from '../../lib/idb';
import { checkout } from '../../lib/pos';
import { printOrder, usePrinterConfig } from '../../printing/service';
import { clearCart, useCart } from './cart';

const METHODS: { id: PaymentMethod; icon: typeof Banknote }[] = [
  { id: 'cash', icon: Banknote },
  { id: 'qris', icon: QrCode },
  { id: 'card', icon: CreditCard },
];

export function PaymentSheet({ total, onClose, onPaid }: { total: number; onClose: () => void; onPaid: (order: LocalOrder) => void }) {
  const cart = useCart();
  const printer = usePrinterConfig();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [raw, setRaw] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tendered = parseInt(raw || '0', 10);
  const change = tendered - total;
  const valid = method !== 'cash' || tendered >= total;

  /**
   * Satu sentuhan: simpan transaksi di tablet, lalu langsung kirim struk ke printer.
   * Cetak dipanggil di dalam sentuhan yang sama (syarat Chrome untuk membuka RawBT).
   * Bila cetak gagal, transaksi tetap tersimpan dan bisa dicetak ulang.
   */
  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const order = await checkout({
        lines: cart.lines,
        discount: cart.discount,
        customerName: cart.customerName,
        method,
        tendered: method === 'cash' ? tendered : total,
        reference,
      });
      if (printer.autoPrint) void printOrder(order);
      clearCart();
      onPaid(order);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal open size="xl" onClose={onClose} dismissable={!busy} title="Pembayaran">
      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-brand-900 p-4 text-white">
            <p className="text-sm text-brand-200">Total bayar</p>
            <p className="text-4xl font-extrabold tabular">{formatRupiah(total)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={cx(
                  'flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 font-semibold',
                  method === id ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-stone-200 bg-white text-stone-600',
                )}
              >
                <Icon className="size-7" />
                {PAYMENT_LABEL[id]}
              </button>
            ))}
          </div>

          {method === 'cash' ? (
            <div className="rounded-2xl border border-stone-200 p-4">
              <p className="text-sm text-stone-500">Uang diterima</p>
              <p className="text-3xl font-bold tabular">{formatRupiah(tendered)}</p>
              <p className={cx('mt-2 text-lg font-semibold tabular', change >= 0 ? 'text-emerald-700' : 'text-stone-400')}>
                Kembalian: {change >= 0 ? formatRupiah(change) : '-'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                Pastikan pembayaran {PAYMENT_LABEL[method]} sudah <u>berhasil</u> di {method === 'qris' ? 'HP/akun merchant' : 'mesin EDC'} sebelum menekan tombol.
              </p>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value.slice(0, 60))}
                placeholder={method === 'card' ? 'No. approval EDC (opsional)' : 'No. referensi (opsional)'}
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {method === 'cash' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {cashSuggestions(total).map((n, i) => (
                  <button
                    key={n}
                    onClick={() => setRaw(String(n))}
                    className={cx('h-12 rounded-xl text-sm font-bold tabular', tendered === n ? 'bg-brand-900 text-white' : 'bg-brand-50 text-brand-900')}
                  >
                    {i === 0 ? 'Uang pas' : formatNumber(n)}
                  </button>
                ))}
              </div>
              <NumPad onKey={(k) => setRaw((r) => applyNumKey(r, k, 9))} />
            </>
          )}
          <ErrorNote>{error}</ErrorNote>
          <Button
            size="xl"
            variant="success"
            className="mt-auto w-full"
            loading={busy}
            disabled={!valid}
            icon={printer.autoPrint ? <Printer className="size-6" /> : undefined}
            onClick={pay}
          >
            {printer.autoPrint ? 'Bayar & Cetak' : 'Bayar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
