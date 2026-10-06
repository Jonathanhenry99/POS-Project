import { ImageUp, ReceiptText, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LAYOUT,
  DEFAULT_RECEIPT_SETTINGS,
  computeTotals,
  priceLine,
  saleReceipt,
  type AppSettings,
  type Order,
  type OrderItem,
  type OrderItemOption,
  type PricingSettings,
  type ReceiptImage,
  type ReceiptSettings,
} from '@mourden/shared';
import { ReceiptPreview } from '../../components/ReceiptPreview';
import { toast } from '../../components/feedback';
import { Button, Card, Segmented, Toggle, cx } from '../../components/ui';
import { DEFAULT_LOGO, prepareLogoUpload, receiptLogoFor } from '../../lib/brand';

const textareaClass =
  'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15';

/** Logo toko + bentuk struk, dengan pratinjau struk 58 mm yang berubah langsung. */
export function ReceiptSettingsCard({ form, onChange }: { form: AppSettings; onChange: (next: AppSettings) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const receipt = form.receipt ?? DEFAULT_RECEIPT_SETTINGS;
  const customLogo = form.brand?.logo ?? '';
  const logoSrc = customLogo || DEFAULT_LOGO;

  const setReceipt = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => onChange({ ...form, receipt: { ...receipt, [key]: value } });
  const setLogo = (logo: string) => onChange({ ...form, brand: { logo } });

  const [logo, setLogoBitmap] = useState<ReceiptImage | null>(null);
  useEffect(() => {
    let live = true;
    void receiptLogoFor(logoSrc, receipt, 32).then((img) => live && setLogoBitmap(img));
    return () => {
      live = false;
    };
  }, [logoSrc, receipt]);

  const ops = useMemo(
    () => saleReceipt(sampleOrder(form.pricing), form.store, DEFAULT_LAYOUT, { format: receipt, logo }).filter((op) => op.kind !== 'feed'),
    [form.pricing, form.store, receipt, logo],
  );

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setLogo(await prepareLogoUpload(file));
      toast('Logo siap. Tekan Simpan untuk menerapkan.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card title="Logo & bentuk struk" icon={<ReceiptText className="size-5" />} className="lg:col-span-2">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Logo toko" hint="Tampil di layar kasir, login, back office, dan struk.">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-28 w-40 place-items-center rounded-2xl border border-line bg-white p-2">
                <img src={logoSrc} alt="Logo toko" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
                <Button variant="outline" icon={<ImageUp className="size-5" />} loading={busy} onClick={() => fileRef.current?.click()}>
                  Ganti logo
                </Button>
                {customLogo && (
                  <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setLogo('')}>
                    Pakai logo bawaan
                  </Button>
                )}
                <p className="max-w-xs text-xs text-fg-muted">PNG/JPG/WebP. Paling bagus berlatar putih atau transparan; margin kosong dipangkas otomatis.</p>
              </div>
            </div>
          </Section>

          <Section title="Logo di struk">
            <Toggle checked={receipt.showLogo} onChange={(v) => setReceipt('showLogo', v)} label="Cetak logo di struk" description="Dicetak hitam-putih di bagian paling atas." />
            {receipt.showLogo && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-fg-muted">Ukuran</p>
                  <Segmented value={receipt.logoSize} onChange={(v) => setReceipt('logoSize', v)} options={[{ value: 'small', label: 'Kecil' }, { value: 'medium', label: 'Sedang' }, { value: 'large', label: 'Besar' }]} />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-fg-muted">Ketebalan</p>
                  <Segmented value={receipt.logoDarkness} onChange={(v) => setReceipt('logoDarkness', v)} options={[{ value: 'light', label: 'Tipis' }, { value: 'normal', label: 'Normal' }, { value: 'dark', label: 'Tebal' }]} />
                </div>
              </div>
            )}
          </Section>

          <Section title="Kepala struk">
            <Toggle
              checked={receipt.showStoreName}
              onChange={(v) => setReceipt('showStoreName', v)}
              label="Nama toko (teks besar)"
              description="Matikan bila nama sudah terbaca di logo. Bila logo gagal dimuat, nama tetap dicetak."
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-fg-muted">Teks tambahan di bawah alamat</span>
              <textarea rows={2} maxLength={200} value={receipt.headerNote} onChange={(e) => setReceipt('headerNote', e.target.value)} placeholder="Contoh: IG @mourden.coffee" className={textareaClass} />
            </label>
          </Section>

          <Section title="Isi struk">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Toggle checked={receipt.showCashier} onChange={(v) => setReceipt('showCashier', v)} label="Nama kasir" />
              <Toggle checked={receipt.showOrderType} onChange={(v) => setReceipt('showOrderType', v)} label="Dine in / Take away" />
              <Toggle checked={receipt.showCustomer} onChange={(v) => setReceipt('showCustomer', v)} label="Nama pelanggan, meja & tamu" />
              <Toggle checked={receipt.showItemOptions} onChange={(v) => setReceipt('showItemOptions', v)} label="Varian & add-on" />
              <Toggle checked={receipt.showItemNotes} onChange={(v) => setReceipt('showItemNotes', v)} label="Catatan per item" />
              <Toggle checked={receipt.showItemCount} onChange={(v) => setReceipt('showItemCount', v)} label="Jumlah item di subtotal" />
            </div>
          </Section>

          <Section title="Penutup struk" hint="Boleh beberapa baris, mis. ucapan terima kasih, Instagram, atau info Wi-Fi.">
            <textarea
              rows={3}
              maxLength={200}
              value={form.store.footer}
              onChange={(e) => onChange({ ...form, store: { ...form.store, footer: e.target.value } })}
              placeholder="Terima kasih!"
              className={textareaClass}
            />
          </Section>
        </div>

        <div className="lg:w-[calc(32ch+3.5rem)]">
          <div className="sticky top-4 rounded-2xl bg-surface-2 p-4">
            <p className="mb-3 text-center text-sm font-semibold text-fg-muted">Pratinjau struk 58 mm</p>
            <ReceiptPreview ops={ops} width={32} />
            <p className={cx('mt-3 text-center text-xs text-fg-subtle')}>
              Contoh pesanan. Tablet kasir menerima perubahan setelah Simpan (otomatis dalam ±5 menit, atau buka ulang aplikasi).
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="font-bold">{title}</h3>
        {hint && <p className="text-sm text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function sampleItem(name: string, basePrice: number, qty: number, options: OrderItemOption[] = [], note = ''): OrderItem {
  return { id: name, productId: name, name, basePrice, qty, options, note, ...priceLine(basePrice, options, qty) };
}

/** Pesanan contoh untuk pratinjau, memakai tarif service/pajak yang sedang diatur. */
export function sampleOrder(pricing: PricingSettings): Order {
  const items = [
    sampleItem('Es Kopi Susu Gula Aren', 25000, 2, [{ optionId: 'l', groupName: 'Ukuran', name: 'Large', priceDelta: 5000 }], 'Less sugar'),
    sampleItem('Croissant Butter', 28000, 1),
  ];
  const totals = computeTotals(items, null, pricing);
  const tendered = Math.ceil(totals.total / 50000) * 50000;
  return {
    id: 'contoh',
    number: 'B261006-001',
    deviceId: '',
    shiftId: '',
    cashierId: '',
    cashierName: 'Rina',
    createdAt: new Date().toISOString(),
    customerName: 'Andi',
    orderType: 'dine_in',
    tableName: 'Meja 3',
    pax: 2,
    items,
    discount: null,
    servicePct: pricing.servicePct,
    taxPct: pricing.taxPct,
    taxLabel: pricing.taxLabel,
    ...totals,
    payment: { method: 'cash', amount: totals.total, tendered, change: tendered - totals.total, reference: '' },
    status: 'paid',
    voidReason: '',
    voidedAt: null,
    voidedById: null,
    voidedByName: '',
    voidApprovedById: null,
  };
}
