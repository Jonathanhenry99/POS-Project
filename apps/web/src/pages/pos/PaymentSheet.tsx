import { Banknote, CreditCard, Printer, QrCode } from 'lucide-react';
import { useRef, useState } from 'react';
import { cashSuggestions, formatNumber, formatRupiah, ORDER_TYPE_LABEL, PAYMENT_LABEL, type PaymentMethod } from '@mourden/shared';
import { Button, ErrorNote, Modal, NumPad, applyNumKey, cx, inputClass } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import type { LocalOrder } from '../../lib/idb';
import { checkout } from '../../lib/pos';
import { printOrder, usePrinterConfig } from '../../printing/service';
import { clearCart, markPaidDraft, useCart } from './cart';
import { toast } from '../../components/feedback';

const METHODS: { id: PaymentMethod; icon: typeof Banknote; hint: string }[] = [
  { id: 'cash', icon: Banknote, hint: 'Hitung kembalian' },
  { id: 'qris', icon: QrCode, hint: 'Merchant / EDC' },
  { id: 'card', icon: CreditCard, hint: 'Mesin EDC' },
];

export function PaymentSheet({ total, onClose, onPaid }: { total: number; onClose: () => void; onPaid: (order: LocalOrder) => void }) {
  const cart = useCart();
  const printer = usePrinterConfig();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [raw, setRaw] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paying = useRef(false);

  const tendered = parseInt(raw || '0', 10);
  const change = tendered - total;
  const valid = method !== 'cash' || tendered >= total;
  const items = cart.lines.reduce((s, l) => s + l.qty, 0);

  /**
   * Satu sentuhan: simpan transaksi di tablet, lalu langsung kirim struk ke printer.
   * Cetak dipanggil di dalam sentuhan yang sama (syarat Chrome untuk membuka RawBT).
   * Bila cetak gagal, transaksi tetap tersimpan dan bisa dicetak ulang.
   */
  const pay = async () => {
    if (paying.current) return;
    paying.current = true;
    setBusy(true);
    setError('');
    try {
      const order = await checkout({
        lines: cart.lines,
        discount: cart.discount,
        customerName: cart.customerName,
        orderType: cart.orderType,
        tableName: cart.tableName,
        pax: cart.pax,
        checkoutId: cart.checkoutId,
        method,
        tendered: method === 'cash' ? tendered : total,
        reference,
      });
      if (printer.autoPrint) void printOrder(order);
      markPaidDraft(order.id);
      try { clearCart(); } catch (e) { toast(`Transaksi tersimpan. ${errorMessage(e)} Jangan ulangi pembayaran; kosongkan keranjang setelah penyimpanan tersedia.`, 'error'); }
      onPaid(order);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      paying.current = false;
    }
  };

  return (
    <Modal open size="xl" onClose={onClose} dismissable={!busy} title="Pembayaran">
      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-4">
          <div className="bg-grad-header relative overflow-hidden rounded-3xl p-5 text-white">
            <div className="bg-grid absolute inset-0 opacity-50" />
            <div className="relative">
              <p className="text-sm text-white/80">
                Total bayar · {items} item · {ORDER_TYPE_LABEL[cart.orderType]}
                {cart.customerName && ` · ${cart.customerName}`}
              </p>
              <p className="mt-1 text-[40px] leading-none font-extrabold tracking-tight tabular">{formatRupiah(total)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ id, icon: Icon, hint }) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={cx(
                  'press flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2',
                  method === id ? 'border-primary bg-primary/8 text-primary shadow-[0_10px_24px_-14px_var(--primary)]' : 'border-line bg-surface text-fg-muted hover:border-line-strong',
                )}
              >
                <Icon className="size-7" />
                <span className="font-bold">{PAYMENT_LABEL[id]}</span>
                <span className="text-[11px] font-medium opacity-70">{hint}</span>
              </button>
            ))}
          </div>

          {method === 'cash' ? (
            <div className="rounded-3xl border border-line bg-surface-2 p-4">
              <p className="text-sm text-fg-muted">Uang diterima</p>
              <p className="text-3xl font-extrabold tabular">{formatRupiah(tendered)}</p>
              <div className={cx('mt-3 flex items-center justify-between rounded-2xl px-4 py-3 transition-colors', change >= 0 && tendered > 0 ? 'bg-success/12' : 'bg-surface-3')}>
                <span className="font-semibold text-fg-muted">Kembalian</span>
                <span key={change} className={cx('animate-fade-in text-2xl font-extrabold tabular', change >= 0 && tendered > 0 ? 'text-success' : 'text-fg-subtle')}>
                  {change >= 0 && tendered > 0 ? formatRupiah(change) : '—'}
                </span>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in flex flex-col gap-3 rounded-3xl border border-warning/40 bg-warning/8 p-4">
              <p className="font-semibold text-fg">
                Pastikan pembayaran {PAYMENT_LABEL[method]} sudah <u>berhasil</u> di {method === 'qris' ? 'akun merchant atau EDC eksternal' : 'mesin EDC eksternal'} sebelum menekan tombol.
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
                    className={cx(
                      'press h-12 rounded-2xl border text-sm font-bold tabular',
                      tendered === n ? 'border-transparent bg-grad-accent text-white' : 'border-accent/30 bg-accent/8 text-accent hover:bg-accent/12',
                    )}
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
