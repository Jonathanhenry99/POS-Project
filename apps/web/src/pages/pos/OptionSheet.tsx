import { Minus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber, formatRupiah, priceLine, type OptionGroup, type OrderItemOption, type Product } from '@mourden/shared';
import { Button, Modal, cx, inputClass } from '../../components/ui';
import type { CartLine } from '../../lib/pos';

const QUICK_NOTES = ['Less ice', 'Tanpa es', 'Extra panas', 'Dibungkus', 'Pisah'];

/** Pilih varian/add-on, jumlah, dan catatan. Dipakai untuk tambah item baru maupun ubah item di keranjang. */
export function OptionSheet({
  product,
  groups,
  line,
  onClose,
  onSubmit,
  onRemove,
}: {
  product: Product;
  groups: OptionGroup[];
  line?: CartLine;
  onClose: () => void;
  onSubmit: (options: OrderItemOption[], qty: number, note: string) => void;
  onRemove?: () => void;
}) {
  const productGroups = useMemo(
    () => product.optionGroupIds.map((id) => groups.find((g) => g.id === id)).filter((g): g is OptionGroup => !!g && g.options.length > 0),
    [product, groups],
  );

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (line) return new Set(line.options.map((o) => o.optionId));
    // Grup wajib pilih-satu: pilihan pertama terpilih otomatis supaya cukup satu sentuhan.
    return new Set(productGroups.filter((g) => g.required && !g.multi).map((g) => g.options[0].id));
  });
  const [qty, setQty] = useState(line?.qty ?? 1);
  const [note, setNote] = useState(line?.note ?? '');

  const toggle = (g: OptionGroup, optionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (g.multi) {
        if (next.has(optionId)) next.delete(optionId);
        else next.add(optionId);
      } else {
        const wasSelected = next.has(optionId);
        g.options.forEach((o) => next.delete(o.id));
        if (!wasSelected || g.required) next.add(optionId);
      }
      return next;
    });
  };

  const options: OrderItemOption[] = productGroups.flatMap((g) =>
    g.options.filter((o) => selected.has(o.id)).map((o) => ({ optionId: o.id, groupName: g.name, name: o.name, priceDelta: o.priceDelta })),
  );
  const missing = productGroups.filter((g) => g.required && !g.options.some((o) => selected.has(o.id)));
  const { unitPrice, lineTotal } = priceLine(product.price, options, qty);

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={
        <span>
          {product.name} <span className="font-semibold text-fg-muted">· {formatNumber(unitPrice)}</span>
        </span>
      }
      footer={
        <>
          {onRemove && (
            <Button variant="outline" className="text-danger" icon={<Trash2 className="size-5" />} onClick={onRemove}>
              Hapus
            </Button>
          )}
          <div className="flex items-center gap-2">
            <button aria-label="Kurangi" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-12 place-items-center rounded-xl bg-surface-2 active:bg-surface-3">
              <Minus className="size-5" />
            </button>
            <span className="w-10 text-center text-xl font-bold tabular">{qty}</span>
            <button aria-label="Tambah" onClick={() => setQty((q) => Math.min(999, q + 1))} className="grid size-12 place-items-center rounded-xl bg-surface-2 active:bg-surface-3">
              <Plus className="size-5" />
            </button>
          </div>
          <Button size="lg" variant="success" className="flex-1" disabled={missing.length > 0} onClick={() => onSubmit(options, qty, note)}>
            {line ? 'Simpan' : 'Tambah'} · {formatRupiah(lineTotal)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {productGroups.map((g) => (
          <div key={g.id}>
            <p className="mb-2 font-semibold">
              {g.name}{' '}
              <span className="text-sm font-normal text-fg-muted">{g.multi ? '(boleh lebih dari satu)' : g.required ? '(wajib pilih)' : '(opsional)'}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {g.options.map((o) => {
                const on = selected.has(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggle(g, o.id)}
                    className={cx(
                      'flex h-12 min-w-24 flex-col items-center justify-center rounded-xl border-2 px-4 leading-tight font-semibold',
                      on ? 'border-primary bg-primary/8 text-primary' : 'border-line bg-surface text-fg',
                    )}
                  >
                    {o.name}
                    {o.priceDelta !== 0 && <span className="text-xs font-normal">+{formatNumber(o.priceDelta)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <p className="mb-2 font-semibold">Catatan</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_NOTES.map((n) => (
              <button
                key={n}
                onClick={() => setNote((cur) => (cur.toLowerCase().includes(n.toLowerCase()) ? cur : cur ? `${cur}, ${n}` : n))}
                className="h-10 rounded-lg bg-surface-2 px-3 text-sm font-medium active:bg-surface-3"
              >
                {n}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Contoh: es sedikit" className={inputClass} />
        </div>
      </div>
    </Modal>
  );
}
