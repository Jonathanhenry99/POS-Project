import { ArrowRightLeft, ChefHat, CheckCircle2, Minus, MoreHorizontal, Plus, Printer, ShoppingBasket, Trash2, Utensils } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatNumber, formatRupiah, ORDER_TYPE_LABEL, type AppSettings } from '@mourden/shared';
import { cx } from '../../components/ui';
import { cartTotals, type CartLine } from '../../lib/pos';
import { clearCart, updateLine, useCart } from './cart';
import { confirmDialog, toast } from '../../components/feedback';
import { errorMessage } from '../../lib/api';

export function CartPanel({
  settings,
  onEdit,
  onSave,
  onBill,
  onService,
  onTransfer,
  onChecker,
  onPay,
}: {
  settings: AppSettings;
  onEdit: (l: CartLine) => void;
  onSave: () => void;
  onBill: () => void;
  onService: () => void;
  onTransfer: () => void;
  onChecker: () => void;
  onPay: () => void;
}) {
  const cart = useCart();
  const t = cartTotals(cart.lines, cart.discount, settings.pricing);
  const itemCount = cart.lines.reduce((s, l) => s + l.qty, 0);
  const empty = !cart.lines.length;
  const change = (fn: () => void) => { try { fn(); } catch (e) { toast(errorMessage(e), 'error'); } };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <CheckCircle2 className="size-5 shrink-0 text-success" />
        <p className="min-w-0 flex-1 truncate font-semibold">
          {ORDER_TYPE_LABEL[cart.orderType]}
          {cart.customerName && <span className="text-fg-muted"> · {cart.customerName}</span>}
        </p>
        {cart.savedId && <span className="shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-xs font-semibold text-accent">Tersimpan</span>}
        {cart.orderType === 'dine_in' && (
          <button
            onClick={onService}
            className={cx(
              'press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-semibold',
              cart.tableName ? 'border-primary/40 bg-primary/8 text-primary' : 'border-line text-fg-muted hover:text-fg',
            )}
          >
            <Utensils className="size-4" />
            {cart.tableName || 'Meja'}
            {cart.pax > 0 && <span className="text-xs">· {cart.pax}</span>}
          </button>
        )}
        <MoreMenu
          disabled={empty}
          items={[
            { label: 'Pindahkan item', icon: ArrowRightLeft, onClick: onTransfer },
            { label: 'Checker dapur/bar', icon: ChefHat, onClick: onChecker },
          ]}
        />
        <button aria-label="Kosongkan pesanan" disabled={empty} onClick={async () => { if (await confirmDialog({ title: 'Kosongkan pesanan?', message: 'Seluruh item pesanan belum dibayar ini akan dihapus. Transaksi lunas tidak berubah.', confirmLabel: 'Kosongkan', danger: true })) change(clearCart); }} className="press grid size-10 shrink-0 place-items-center rounded-xl text-fg-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-30">
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
                <li key={line.key} className="animate-slide-in rounded-2xl px-2 py-2 hover:bg-surface-2">
                  {/* Baris 1: jumlah, nama, total baris */}
                  <div className="flex items-start gap-2.5">
                    <span key={line.qty} className="animate-pop mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
                      {line.qty}
                    </span>
                    <button className="min-w-0 flex-1 text-left leading-tight font-semibold" onClick={() => onEdit(line)}>
                      {item.name}
                    </button>
                    <span className="shrink-0 font-bold tabular">{formatNumber(item.lineTotal)}</span>
                  </div>
                  {/* Baris 2: opsi/catatan (sentuh untuk ubah) + tombol jumlah */}
                  <div className="mt-1 flex items-center gap-2 pl-[38px]">
                    <button className="min-w-0 flex-1 text-left text-[13px] leading-snug" onClick={() => onEdit(line)}>
                      {item.options.length > 0 && (
                        <span className="line-clamp-2 text-primary">
                          + {item.options.map((o) => o.name).join(', ')}
                        </span>
                      )}
                      {item.note && <span className="line-clamp-1 text-accent italic">“{item.note}”</span>}
                      {!item.options.length && !item.note && <span className="text-fg-subtle">@ {formatNumber(item.unitPrice)}</span>}
                    </button>
                    <div className="flex shrink-0 items-center rounded-xl border border-line bg-surface">
                      <button aria-label="Kurangi" onClick={() => change(() => updateLine(line.key, { qty: line.qty - 1 }))} className="press grid h-11 w-12 place-items-center rounded-l-xl text-fg-muted hover:text-danger">
                        <Minus className="size-4" />
                      </button>
                      <button aria-label="Tambah" onClick={() => change(() => updateLine(line.key, { qty: line.qty + 1 }))} className="press grid h-11 w-12 place-items-center rounded-r-xl border-l border-line text-fg-muted hover:text-primary">
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

      <div className="shrink-0 border-t border-dashed border-line-strong bg-surface-2/60 px-3 pt-2.5 pb-3">
        <dl className="tabular space-y-0.5 text-sm">
          <Row label={`Subtotal · ${itemCount} item`} value={formatNumber(t.subtotal)} />
          {t.discountAmount > 0 && <Row label="Diskon" value={`-${formatNumber(t.discountAmount)}`} tone="text-danger" />}
          {t.serviceAmount > 0 && <Row label={`Service ${settings.pricing.servicePct}%`} value={formatNumber(t.serviceAmount)} />}
          {t.taxAmount > 0 && <Row label={`${settings.pricing.taxLabel} ${settings.pricing.taxPct}%`} value={formatNumber(t.taxAmount)} />}
          {t.roundingAmount !== 0 && <Row label="Pembulatan" value={formatNumber(t.roundingAmount)} />}
        </dl>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            disabled={empty}
            onClick={onSave}
            className="press flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-accent/70 bg-accent/5 font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            <ShoppingBasket className="size-5" /> Simpan
          </button>
          <button
            disabled={empty}
            onClick={onBill}
            className="press flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-primary/60 bg-primary/5 font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            <Printer className="size-5" /> Cetak Struk
          </button>
        </div>
        <button
          disabled={empty}
          onClick={onPay}
          className={cx(
            'press mt-2 flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold text-white',
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

/** Menu kecil "⋯" untuk aksi yang jarang dipakai, supaya kepala keranjang tetap ringkas. */
function MoreMenu({ items, disabled }: { items: { label: string; icon: typeof Trash2; onClick: () => void }[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        aria-label="Aksi lain"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="press grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <div className="animate-rise absolute top-11 right-0 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-card">
          {items.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-surface-2"
            >
              <Icon className="size-5 text-fg-muted" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
