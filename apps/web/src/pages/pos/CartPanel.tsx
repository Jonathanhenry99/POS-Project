import { Minus, Percent, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { formatNumber, formatRupiah, type AppSettings } from '@mourden/shared';
import { Button, Empty, cx } from '../../components/ui';
import { cartTotals, type CartLine } from '../../lib/pos';
import { clearCart, setCustomerName, updateLine, useCart } from './cart';

export function CartPanel({ settings, onEdit, onDiscount, onPay }: { settings: AppSettings; onEdit: (l: CartLine) => void; onDiscount: () => void; onPay: () => void }) {
  const cart = useCart();
  const t = cartTotals(cart.lines, cart.discount, settings.pricing);
  const itemCount = cart.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="flex h-full flex-col border-l border-stone-200 bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-stone-100 px-3 py-2">
        <input
          value={cart.customerName}
          onChange={(e) => setCustomerName(e.target.value.slice(0, 60))}
          placeholder="Nama pelanggan (opsional)"
          className="h-11 min-w-0 flex-1 rounded-xl bg-stone-100 px-3 outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          aria-label="Kosongkan pesanan"
          disabled={!cart.lines.length}
          onClick={clearCart}
          className="grid size-11 place-items-center rounded-xl text-stone-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          <Trash2 className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!cart.lines.length ? (
          <Empty icon={<ShoppingBag className="size-10 text-stone-300" />} title="Belum ada pesanan">
            Sentuh menu di sebelah kiri untuk menambahkan.
          </Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {t.items.map((item, i) => {
              const line = cart.lines[i];
              return (
                <li key={line.key} className="flex gap-2 px-3 py-2.5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(line)}>
                    <span className="block leading-tight font-semibold">{item.name}</span>
                    {item.options.length > 0 && <span className="block text-sm text-stone-500">{item.options.map((o) => o.name).join(', ')}</span>}
                    {item.note && <span className="block text-sm text-amber-700 italic">“{item.note}”</span>}
                    <span className="tabular block text-sm text-stone-500">@ {formatNumber(item.unitPrice)}</span>
                  </button>
                  <div className="flex flex-col items-end justify-between gap-1">
                    <span className="tabular font-semibold">{formatNumber(item.lineTotal)}</span>
                    <div className="flex items-center gap-1">
                      <button aria-label="Kurangi" onClick={() => updateLine(line.key, { qty: line.qty - 1 })} className="grid size-10 place-items-center rounded-lg bg-stone-100 active:bg-stone-200">
                        <Minus className="size-4" />
                      </button>
                      <span className="w-8 text-center font-bold tabular">{line.qty}</span>
                      <button aria-label="Tambah" onClick={() => updateLine(line.key, { qty: line.qty + 1 })} className="grid size-10 place-items-center rounded-lg bg-stone-100 active:bg-stone-200">
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-stone-200 p-3">
        <dl className="tabular mb-2 space-y-0.5 text-sm">
          <Row label={`Subtotal (${itemCount} item)`} value={formatNumber(t.subtotal)} />
          <button onClick={onDiscount} disabled={!cart.lines.length} className="flex w-full items-center justify-between py-1 text-left disabled:opacity-50">
            <span className={cx('flex items-center gap-1 font-semibold', t.discountAmount ? 'text-emerald-700' : 'text-brand-700')}>
              <Percent className="size-4" />
              {t.discountAmount ? `Diskon${cart.discount?.type === 'percent' ? ` ${cart.discount.value}%` : ''}` : 'Tambah diskon'}
            </span>
            {t.discountAmount > 0 && <span className="font-semibold text-emerald-700">-{formatNumber(t.discountAmount)}</span>}
          </button>
          {t.serviceAmount > 0 && <Row label={`Service ${settings.pricing.servicePct}%`} value={formatNumber(t.serviceAmount)} />}
          {t.taxAmount > 0 && <Row label={`${settings.pricing.taxLabel} ${settings.pricing.taxPct}%`} value={formatNumber(t.taxAmount)} />}
          {t.roundingAmount !== 0 && <Row label="Pembulatan" value={formatNumber(t.roundingAmount)} />}
        </dl>
        <Button size="xl" variant="success" className="w-full justify-between" disabled={!cart.lines.length} onClick={onPay}>
          <span>Bayar</span>
          <span className="tabular">{formatRupiah(t.total)}</span>
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-stone-600">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
