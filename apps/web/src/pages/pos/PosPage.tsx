import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { formatRupiah, type Product } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Button, MoneyInput, Modal } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { kvSet, type LocalOrder } from '../../lib/idb';
import { cartTotals, openShift, type CartLine } from '../../lib/pos';
import { appStore, useApp } from '../../lib/state';
import { enqueue } from '../../lib/sync';
import { printStatusStore } from '../../printing/service';
import { addToCart, removeLine, updateLine, useCart } from './cart';
import { CartPanel } from './CartPanel';
import { DiscountSheet } from './DiscountSheet';
import { DoneSheet } from './DoneSheet';
import { OptionSheet } from './OptionSheet';
import { PaymentSheet } from './PaymentSheet';
import { ProductGrid } from './ProductGrid';

type Sheet =
  | { kind: 'none' }
  | { kind: 'add'; product: Product }
  | { kind: 'edit'; product: Product; line: CartLine }
  | { kind: 'discount' }
  | { kind: 'pay' }
  | { kind: 'done'; order: LocalOrder };

export function PosPage() {
  const data = useApp((s) => s.data);
  const shift = useApp((s) => s.activeShift);
  const cart = useCart();
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });

  if (!data) return <p className="p-6">Data menu belum tersedia. Sambungkan ke internet.</p>;
  if (!shift) return <OpenShiftPanel />;

  const { catalog, settings } = data;
  const totals = cartTotals(cart.lines, cart.discount, settings.pricing);
  const close = () => setSheet({ kind: 'none' });

  const pick = (product: Product) => {
    // Menu tanpa opsi langsung masuk keranjang dengan satu sentuhan.
    if (!product.optionGroupIds.length) addToCart(product, [], 1, '');
    else setSheet({ kind: 'add', product });
  };

  const toggleSoldOut = async (product: Product) => {
    const next = !product.soldOut;
    const ok = await confirmDialog({
      title: next ? 'Tandai habis?' : 'Tandai tersedia?',
      message: next ? `${product.name} tidak bisa dipesan sampai ditandai tersedia lagi.` : `${product.name} bisa dipesan lagi.`,
      confirmLabel: next ? 'Tandai habis' : 'Tandai tersedia',
    });
    if (!ok) return;
    const s = appStore.get();
    if (!s.data || !s.user) return;
    const updated = { ...s.data, catalog: { ...s.data.catalog, products: s.data.catalog.products.map((p) => (p.id === product.id ? { ...p, soldOut: next } : p)) } };
    appStore.set({ data: updated });
    await kvSet('bootstrap', updated);
    await enqueue({ method: 'POST', path: `/products/${product.id}/sold-out`, body: { soldOut: next }, operatorId: s.user.id, label: `${product.name} ${next ? 'habis' : 'tersedia'}`, ref: null });
    toast(`${product.name} ${next ? 'ditandai habis' : 'tersedia lagi'}`, 'info');
  };

  return (
    <div className="grid h-full grid-cols-[1fr_minmax(340px,38%)]">
      <ProductGrid catalog={catalog} lines={cart.lines} onPick={pick} onLongPress={toggleSoldOut} />
      <CartPanel
        settings={settings}
        onEdit={(line) => {
          const product = catalog.products.find((p) => p.id === line.productId);
          if (product) setSheet({ kind: 'edit', product, line });
        }}
        onDiscount={() => setSheet({ kind: 'discount' })}
        onPay={() => {
          printStatusStore.set({ status: { state: 'idle' } });
          setSheet({ kind: 'pay' });
        }}
      />

      {sheet.kind === 'add' && (
        <OptionSheet
          product={sheet.product}
          groups={catalog.optionGroups}
          onClose={close}
          onSubmit={(options, qty, note) => {
            addToCart(sheet.product, options, qty, note);
            close();
          }}
        />
      )}
      {sheet.kind === 'edit' && (
        <OptionSheet
          product={sheet.product}
          groups={catalog.optionGroups}
          line={sheet.line}
          onClose={close}
          onRemove={() => {
            removeLine(sheet.line.key);
            close();
          }}
          onSubmit={(options, qty, note) => {
            updateLine(sheet.line.key, { options, qty, note });
            close();
          }}
        />
      )}
      {sheet.kind === 'discount' && <DiscountSheet subtotal={totals.subtotal} onClose={close} />}
      {sheet.kind === 'pay' && <PaymentSheet total={totals.total} onClose={close} onPaid={(order) => setSheet({ kind: 'done', order })} />}
      {sheet.kind === 'done' && <DoneSheet order={sheet.order} onClose={close} />}
    </div>
  );
}

function OpenShiftPanel() {
  const user = useApp((s) => s.user)!;
  const [cash, setCash] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open dismissable={false} size="sm" onClose={() => {}} title="Buka shift">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3">
          <Wallet className="size-6 text-brand-700" />
          <p className="text-sm">
            Halo <b>{user.name}</b>. Hitung uang di laci lalu masukkan sebagai modal awal.
          </p>
        </div>
        <MoneyInput value={cash} onChange={setCash} placeholder="0" autoFocus aria-label="Modal awal" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 100000, 200000, 300000, 500000].map((n) => (
            <button key={n} onClick={() => setCash(n)} className="h-11 rounded-xl bg-stone-100 text-sm font-semibold tabular">
              {n ? formatRupiah(n) : 'Rp 0'}
            </button>
          ))}
        </div>
        <Button
          size="lg"
          variant="success"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await openShift(cash);
              toast('Shift dibuka. Selamat bekerja!');
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Buka shift
        </Button>
      </div>
    </Modal>
  );
}
