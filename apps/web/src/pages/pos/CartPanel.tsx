import { CheckCircle2, Minus, Plus, Printer, ShoppingBasket, Trash2 } from 'lucide-react';
import { formatNumber, formatRupiah, ORDER_TYPE_LABEL, type AppSettings } from '@mourden/shared';
import { cx } from '../../components/ui';
import { cartTotals, type CartLine } from '../../lib/pos';
import { clearCart, updateLine, useCart } from './cart';

export function CartPanel({
  settings,
  onEdit,
  onSave,
  onBill,
  onPay,
}: {
  settings: AppSettings;
  onEdit: (l: CartLine) => void;
  onSave: () => void;
  onBill: () => void;
  onPay: () => void;
}) {
  const cart = useCart();
  const t = cartTotals(cart.lines, cart.discount, settings.pricing);
  const itemCount = cart.lines.reduce((s, l) => s + l.qty, 0);
  const empty = !cart.lines.length;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <CheckCircle2 className="size-5 text-success" />
        <p className="min-w-0 flex-1 truncate font-semibold">
          {ORDER_TYPE_LABEL[cart.orderType]}
          {cart.customerName && <span className="text-fg-muted"> · {cart.customerName}</span>}
        </p>
        {cart.savedId && <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">Tersimpan</span>}
        <button aria-label="Kosongkan pesanan" disabled={empty} onClick={clearCart} className="press grid size-10 place-items-center rounded-xl text-fg-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-30">
          <Trash2 className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="grid size-20 place-items-center rounded-full bg-primary/8">
              <ShoppingBasket className="size-9 text-primary/60" />
            </div>
            <p className="font-semibold">Belum ada pesanan</p>
            <p className="text-sm text-fg-muted">Sentuh menu di sebelah kiri untuk menambahkan.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1 p-2">
            {t.items.map((item, i) => {
              const line = cart.lines[i];
              return (
                <li key={line.key} className="animate-slide-in group flex gap-3 rounded-2xl px-2 py-2.5 hover:bg-surface-2">
                  <span key={line.qty} className="animate-pop grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
                    {line.qty}
                  </span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(line)}>
                    <span className="block leading-tight font-semibold">{item.name}</span>
                    {item.options.map((o) => (
                      <span key={o.optionId} className="block text-[13px] text-primary">
                        + {o.name}
                        {o.priceDelta !== 0 && <span className="text-fg-subtle"> ({formatNumber(o.priceDelta)})</span>}
                      </span>
                    ))}
                    {item.note && <span className="block text-[13px] text-accent italic">“{item.note}”</span>}
                  </button>
                  <div className="flex flex-col items-end justify-between gap-1.5">
                    <span className="font-bold tabular">{formatNumber(item.lineTotal)}</span>
                    <div className="flex items-center rounded-xl border border-line bg-surface">
                      <button aria-label="Kurangi" onClick={() => updateLine(line.key, { qty: line.qty - 1 })} className="press grid size-10 place-items-center rounded-l-xl text-fg-muted hover:text-danger">
                        <Minus className="size-4" />
                      </button>
                      <button aria-label="Tambah" onClick={() => updateLine(line.key, { qty: line.qty + 1 })} className="press grid size-10 place-items-center rounded-r-xl border-l border-line text-fg-muted hover:text-primary">
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
            {t.discountAmount > 0 && (
              <li className="animate-slide-in flex justify-between px-3 py-1 text-[13px] text-danger">
                <span>
                  - Diskon{cart.discount?.type === 'percent' ? ` ${cart.discount.value}%` : ''}
                  {cart.discount?.reason ? ` (${cart.discount.reason})` : ''}
                </span>
                <span className="tabular">-{formatNumber(t.discountAmount)}</span>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-dashed border-line-strong bg-surface-2/60 px-4 pt-3 pb-4">
        <dl className="tabular space-y-1 text-sm">
          <Row label="Kuantitas" value={`${itemCount} item`} />
          <Row label="Subtotal" value={formatNumber(t.subtotal)} />
          {t.discountAmount > 0 && <Row label="Diskon" value={`-${formatNumber(t.discountAmount)}`} tone="text-danger" />}
          {t.serviceAmount > 0 && <Row label={`Service ${settings.pricing.servicePct}%`} value={formatNumber(t.serviceAmount)} />}
          {t.taxAmount > 0 && <Row label={`${settings.pricing.taxLabel} ${settings.pricing.taxPct}%`} value={formatNumber(t.taxAmount)} />}
          {t.roundingAmount !== 0 && <Row label="Pembulatan" value={formatNumber(t.roundingAmount)} />}
        </dl>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            disabled={empty}
            onClick={onSave}
            className="press flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-accent/70 bg-accent/5 font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            <ShoppingBasket className="size-5" /> Simpan
          </button>
          <button
            disabled={empty}
            onClick={onBill}
            className="press flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-primary/60 bg-primary/5 font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            <Printer className="size-5" /> Cetak Struk
          </button>
        </div>
        <button
          disabled={empty}
          onClick={onPay}
          className={cx(
            'press mt-2 flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold text-white',
            empty ? 'bg-surface-3 text-fg-subtle' : 'bg-grad-primary glow hover:brightness-110',
          )}
        >
          <span>Bayar</span>
          <span className="h-6 w-px bg-white/40" />
          <span key={t.total} className="animate-fade-in tabular">
            {formatRupiah(t.total)}
          </span>
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cx('flex justify-between', tone ?? 'text-fg-muted')}>
      <dt>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
