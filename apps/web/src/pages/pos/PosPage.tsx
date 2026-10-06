import { ClipboardList, Percent, Search, ShoppingBasket, Trash2, UserRound, Utensils, Wallet, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime, formatNumber, formatRupiah, ORDER_TYPE_LABEL, type Order, type Product } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Button, Empty, Modal, MoneyInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { kvSet, type LocalOrder } from '../../lib/idb';
import { cartTotals, listOrders, openShift, type CartLine } from '../../lib/pos';
import { appStore, useApp } from '../../lib/state';
import { enqueue } from '../../lib/sync';
import { printBill, printStatusStore } from '../../printing/service';
import { addToCart, deleteSaved, openSaved, removeLine, saveCart, setCustomerName, setOrderType, updateLine, useCart, useSaved } from './cart';
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
  | { kind: 'saved' }
  | { kind: 'pay' }
  | { kind: 'done'; order: LocalOrder };

/** Menu terlaris dari transaksi di tablet ini (untuk kategori Favorit). */
function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    void listOrders({ limit: 400 }).then((orders) => {
      const count = new Map<string, number>();
      for (const o of orders) if (o.status === 'paid') for (const i of o.items) count.set(i.productId, (count.get(i.productId) ?? 0) + i.qty);
      setIds([...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id));
    });
  }, []);
  return ids;
}

export function PosPage() {
  const data = useApp((s) => s.data);
  const shift = useApp((s) => s.activeShift);
  const user = useApp((s) => s.user)!;
  const cart = useCart();
  const saved = useSaved();
  const favorites = useFavorites();
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const [query, setQuery] = useState('');

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

  /** Tagihan sementara sebelum bayar (satu sentuhan, langsung ke printer). */
  const bill = () => {
    const draft: Order = {
      id: 'tagihan',
      number: '',
      deviceId: '',
      shiftId: shift.id,
      cashierId: user.id,
      cashierName: user.name,
      createdAt: new Date().toISOString(),
      customerName: cart.customerName.trim(),
      orderType: cart.orderType,
      ...totals,
      discount: cart.discount,
      servicePct: settings.pricing.serviceEnabled ? settings.pricing.servicePct : 0,
      taxPct: settings.pricing.taxEnabled ? settings.pricing.taxPct : 0,
      taxLabel: settings.pricing.taxLabel,
      payment: { method: 'cash', amount: totals.total, tendered: 0, change: 0, reference: '' },
      status: 'paid',
      voidReason: '',
      voidedAt: null,
      voidedById: null,
      voidedByName: '',
      voidApprovedById: null,
    };
    void printBill(draft).then((ok) => toast(ok ? 'Tagihan dikirim ke printer' : 'Gagal mencetak tagihan', ok ? 'success' : 'error'));
  };

  const typeBtn = (active: boolean) =>
    cx('press flex h-full items-center gap-2 rounded-xl px-3.5 text-sm font-semibold', active ? 'bg-primary text-white shadow-[0_6px_16px_-8px_var(--primary)]' : 'text-fg-muted hover:text-fg');

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Baris atas: tipe pesanan, nama pelanggan, cari, promo, tersimpan */}
      <div className="flex shrink-0 items-stretch gap-2">
        <div className="flex h-14 items-center gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-card">
          <button className={typeBtn(cart.orderType === 'dine_in')} onClick={() => setOrderType('dine_in')}>
            <Utensils className="size-4" /> {ORDER_TYPE_LABEL.dine_in}
          </button>
          <button className={typeBtn(cart.orderType === 'take_away')} onClick={() => setOrderType('take_away')}>
            <ShoppingBasket className="size-4" /> {ORDER_TYPE_LABEL.take_away}
          </button>
        </div>
        <label className="relative flex h-14 min-w-0 flex-1 items-center rounded-2xl border border-line bg-surface shadow-card focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12">
          <UserRound className="ml-3.5 size-5 shrink-0 text-fg-subtle" />
          <span className="absolute top-1.5 left-11 text-[10px] font-semibold tracking-wide text-fg-subtle uppercase">Info tambahan / nama customer</span>
          <input
            value={cart.customerName}
            onChange={(e) => setCustomerName(e.target.value.slice(0, 60))}
            placeholder="Ketik nama…"
            className="h-full min-w-0 flex-1 bg-transparent pt-3.5 pr-3 pl-2.5 font-semibold outline-none placeholder:font-normal placeholder:text-fg-subtle"
          />
        </label>
        <label className="relative flex h-14 w-64 items-center rounded-2xl border border-line bg-surface shadow-card focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/12">
          <Search className="ml-3.5 size-5 shrink-0 text-fg-subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari menu…" className="h-full min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-fg-subtle" />
          {query && (
            <button aria-label="Hapus pencarian" onClick={() => setQuery('')} className="mr-1.5 grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-surface-2">
              <X className="size-4" />
            </button>
          )}
        </label>
        <button
          onClick={() => setSheet({ kind: 'discount' })}
          disabled={!cart.lines.length}
          className={cx(
            'press flex h-14 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold shadow-card disabled:opacity-50',
            cart.discount ? 'border-danger/40 bg-danger/8 text-danger' : 'border-line bg-surface text-fg hover:border-primary/50',
          )}
        >
          <Percent className="size-5" /> {cart.discount ? `Diskon ${cart.discount.type === 'percent' ? `${cart.discount.value}%` : formatNumber(cart.discount.value)}` : 'Promo'}
        </button>
        <button
          onClick={() => setSheet({ kind: 'saved' })}
          className="press relative flex h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-semibold shadow-card hover:border-accent/60"
        >
          <ClipboardList className="size-5 text-accent" /> Tersimpan
          {saved.length > 0 && (
            <span key={saved.length} className="animate-pop grid h-6 min-w-6 place-items-center rounded-full bg-grad-accent px-1.5 text-xs font-bold text-white">
              {saved.length}
            </span>
          )}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(360px,36%)] gap-3">
        <div className="min-h-0 overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <ProductGrid catalog={catalog} lines={cart.lines} favorites={favorites} query={query} onPick={pick} onLongPress={toggleSoldOut} />
        </div>
        <CartPanel
          settings={settings}
          onEdit={(line) => {
            const product = catalog.products.find((p) => p.id === line.productId);
            if (product) setSheet({ kind: 'edit', product, line });
          }}
          onSave={() => {
            const s = saveCart();
            if (s) toast(`Pesanan "${s.label}" disimpan`, 'info');
          }}
          onBill={bill}
          onPay={() => {
            printStatusStore.set({ status: { state: 'idle' } });
            setSheet({ kind: 'pay' });
          }}
        />
      </div>

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
      {sheet.kind === 'saved' && <SavedSheet onClose={close} />}
      {sheet.kind === 'pay' && <PaymentSheet total={totals.total} onClose={close} onPaid={(order) => setSheet({ kind: 'done', order })} />}
      {sheet.kind === 'done' && <DoneSheet order={sheet.order} onClose={close} />}
    </div>
  );
}

/** Daftar pesanan tersimpan (pelanggan bayar nanti / masih memilih). */
function SavedSheet({ onClose }: { onClose: () => void }) {
  const saved = useSaved();
  const settings = useApp((s) => s.data?.settings);
  const tz = settings?.store.timezone ?? 'Asia/Jakarta';
  return (
    <Modal open size="md" onClose={onClose} title="Pesanan tersimpan">
      {!saved.length ? (
        <Empty icon={<ClipboardList className="size-8" />} title="Belum ada pesanan tersimpan">
          Tekan “Simpan” di keranjang untuk menahan pesanan dan melanjutkannya nanti.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...saved].reverse().map((o) => {
            const total = settings ? cartTotals(o.lines, o.discount, settings.pricing).total : 0;
            const items = o.lines.reduce((s, l) => s + l.qty, 0);
            return (
              <li key={o.id} className="animate-rise flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                  <ClipboardList className="size-5" />
                </span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    openSaved(o.id);
                    onClose();
                  }}
                >
                  <p className="truncate font-bold">{o.label}</p>
                  <p className="text-sm text-fg-muted">
                    {ORDER_TYPE_LABEL[o.orderType]} · {items} item · {formatDateTime(o.savedAt, tz).slice(-5)}
                  </p>
                </button>
                <span className="font-bold tabular">{formatRupiah(total)}</span>
                <button
                  aria-label={`Hapus ${o.label}`}
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Hapus pesanan tersimpan?', message: `${o.label} akan dihapus.`, confirmLabel: 'Hapus', danger: true })) deleteSaved(o.id);
                  }}
                  className="press grid size-11 place-items-center rounded-xl text-fg-subtle hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function OpenShiftPanel() {
  const user = useApp((s) => s.user)!;
  const [cash, setCash] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open dismissable={false} size="sm" onClose={() => {}} title="Buka shift">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl bg-primary/8 p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-grad-primary text-white">
            <Wallet className="size-5" />
          </span>
          <p className="text-sm">
            Halo <b>{user.name}</b>! Hitung uang di laci lalu masukkan sebagai modal awal.
          </p>
        </div>
        <MoneyInput value={cash} onChange={setCash} placeholder="0" autoFocus aria-label="Modal awal" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 100000, 200000, 300000, 500000].map((n) => (
            <button key={n} onClick={() => setCash(n)} className={cx('press h-11 rounded-xl border text-sm font-semibold tabular', cash === n ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-surface-2')}>
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
