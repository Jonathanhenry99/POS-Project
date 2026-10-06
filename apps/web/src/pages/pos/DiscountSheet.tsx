import { useState } from 'react';
import { discountAmountOf, formatNumber, formatRupiah, type Discount, type PublicUser } from '@mourden/shared';
import { OwnerApproval } from '../../components/OwnerApproval';
import { Button, Modal, NumPad, Segmented, applyNumKey, cx, inputClass } from '../../components/ui';
import { useApp } from '../../lib/state';
import { setDiscount, useCart } from './cart';

const QUICK_PCT = [5, 10, 15, 20, 25, 50];
const REASONS = ['Member', 'Promo', 'Karyawan', 'Kompensasi'];

export function DiscountSheet({ subtotal, onClose }: { subtotal: number; onClose: () => void }) {
  const cart = useCart();
  const user = useApp((s) => s.user)!;
  const maxPct = useApp((s) => s.data?.settings.policy.maxCashierDiscountPct ?? 100);
  const [type, setType] = useState<Discount['type']>(cart.discount?.type ?? 'percent');
  const [raw, setRaw] = useState(cart.discount ? String(cart.discount.value) : '');
  const [reason, setReason] = useState((cart.discount?.reason ?? '').replace(/ \(ACC .*\)$/, ''));
  const [askOwner, setAskOwner] = useState(false);

  const value = Math.min(type === 'percent' ? 100 : subtotal, parseInt(raw || '0', 10));
  const discount: Discount = { type, value, reason: reason.trim() };
  const amount = discountAmountOf(subtotal, discount);
  const pctOfSubtotal = subtotal ? (amount / subtotal) * 100 : 0;
  const needsOwner = user.role !== 'owner' && pctOfSubtotal > maxPct;

  /** Persetujuan owner dicatat di alasan diskon agar terlihat di struk, riwayat, dan laporan. */
  const apply = (approvedBy: PublicUser | null) => {
    const reasonText = approvedBy ? `${discount.reason} (ACC ${approvedBy.name})`.trim() : discount.reason;
    setDiscount(value > 0 ? { ...discount, reason: reasonText } : null);
    onClose();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Diskon pesanan"
        footer={
          <>
            {cart.discount && (
              <Button variant="outline" onClick={() => apply(null)} className="text-red-600">
                Hapus diskon
              </Button>
            )}
            <Button size="lg" className="flex-1" disabled={value <= 0} onClick={() => (needsOwner ? setAskOwner(true) : apply(null))}>
              {needsOwner ? 'Minta PIN owner' : 'Terapkan'} {amount > 0 && `(-${formatRupiah(amount)})`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Segmented
            value={type}
            onChange={(t) => {
              setType(t);
              setRaw('');
            }}
            options={[
              { value: 'percent', label: 'Persen (%)' },
              { value: 'amount', label: 'Nominal (Rp)' },
            ]}
          />
          <div className="rounded-2xl bg-stone-100 px-4 py-3 text-right text-3xl font-bold tabular">
            {type === 'percent' ? `${value}%` : formatRupiah(value)}
            <span className="block text-sm font-normal text-stone-500">dari subtotal {formatNumber(subtotal)}</span>
          </div>
          {type === 'percent' && (
            <div className="grid grid-cols-6 gap-2">
              {QUICK_PCT.map((p) => (
                <button key={p} onClick={() => setRaw(String(p))} className={cx('h-11 rounded-xl font-semibold', value === p ? 'bg-brand-900 text-white' : 'bg-stone-100')}>
                  {p}%
                </button>
              ))}
            </div>
          )}
          <NumPad extra={type === 'amount' ? '000' : null} onKey={(k) => setRaw((r) => applyNumKey(r, k, type === 'percent' ? 3 : 9))} />
          <div>
            <p className="mb-2 text-sm font-semibold">Alasan</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} className={cx('h-10 rounded-lg px-3 text-sm font-medium', reason === r ? 'bg-brand-900 text-white' : 'bg-stone-100')}>
                  {r}
                </button>
              ))}
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 100))} placeholder="Alasan lain" className={inputClass} />
          </div>
          {needsOwner && <p className="text-sm text-amber-700">Diskon di atas {maxPct}% perlu persetujuan owner.</p>}
        </div>
      </Modal>
      {askOwner && (
        <OwnerApproval
          reason={`Diskon ${formatRupiah(amount)} (${Math.round(pctOfSubtotal)}%) melebihi batas kasir.`}
          onClose={() => setAskOwner(false)}
          onApproved={(owner) => apply(owner)}
        />
      )}
    </>
  );
}
