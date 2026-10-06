import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, ClipboardList, Clock3, History, Plus, Receipt, Trash2, Users, Utensils } from 'lucide-react';
import { formatDateTime, formatNumber, formatRupiah, ORDER_TYPE_LABEL } from '@mourden/shared';
import { Button, Empty, cx } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { errorMessage } from '../../lib/api';
import { cartTotals } from '../../lib/pos';
import { useApp } from '../../lib/state';
import { deleteSaved, openSaved, setService, setOrderType, useCart, useCartEvents, useSaved, type SavedOrder } from './cart';
import { CancellationSheet } from './ServiceSheets';

/** "12 mnt" / "1 j 5 mnt" sejak pesanan disimpan. */
function waited(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} j ${m % 60} mnt`;
}

export function TablesPage() {
  const data = useApp((s) => s.data);
  const cart = useCart();
  const saved = useSaved();
  const events = useCartEvents();
  const [showLog, setShowLog] = useState(false);
  const navigate = useNavigate();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!data) return <Empty title="Data toko belum tersedia" />;

  const tables = [...new Set([...(data.settings.pos?.tables ?? []), ...saved.map((o) => o.tableName).filter(Boolean), ...(cart.tableName ? [cart.tableName] : [])])];
  const open = (id: string) => {
    try {
      openSaved(id);
      navigate('/kasir');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const total = (o: SavedOrder) => cartTotals(o.lines, o.discount, data.settings.pricing).total;
  const items = (o: SavedOrder) => o.lines.reduce((n, l) => n + l.qty, 0);
  const occupied = tables.filter((t) => saved.some((o) => o.tableName === t) || (cart.tableName === t && cart.lines.length > 0)).length;

  const pickTable = async (name: string) => {
    const order = saved.find((o) => o.tableName === name);
    const active = cart.tableName === name && cart.lines.length > 0;
    if (order) return open(order.id);
    if (active) return navigate('/kasir');
    if (cart.lines.length && !(await confirmDialog({ title: 'Pindah meja pesanan aktif?', message: `Seluruh pesanan aktif akan memakai ${name}. Item dan harga tetap.`, confirmLabel: 'Pindah meja' }))) return;
    try {
      setOrderType('dine_in');
      setService(name, cart.pax);
      navigate('/kasir');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Meja & pesanan</h1>
            <p className="text-sm text-fg-muted">Ketuk meja kosong untuk pesanan baru, atau meja terisi untuk melanjutkan pesanannya.</p>
          </div>
          <Button icon={<Receipt className="size-5" />} onClick={() => navigate('/kasir')}>
            Kembali ke kasir
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Summary icon={<Utensils className="size-5" />} label="Meja kosong" value={tables.length - occupied} tone="primary" />
          <Summary icon={<Users className="size-5" />} label="Meja terisi" value={occupied} tone="accent" />
          <Summary icon={<ClipboardList className="size-5" />} label="Pesanan belum dibayar" value={saved.length} tone="muted" />
        </div>

        <section className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Denah meja</h2>
            <div className="flex items-center gap-3 text-xs text-fg-muted">
              <Legend className="bg-surface-2 ring-line" label="Kosong" />
              <Legend className="bg-accent/15 ring-accent/40" label="Tersimpan" />
              <Legend className="bg-primary/12 ring-primary/40" label="Sedang dibuka" />
            </div>
          </div>
          {!tables.length ? (
            <Empty icon={<Utensils className="size-8" />} title="Belum ada daftar meja">
              Owner bisa menambahkan meja di Admin → Pengaturan → Master operasional kasir.
            </Empty>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {tables.map((name, i) => {
                const order = saved.find((o) => o.tableName === name);
                const active = cart.tableName === name && cart.lines.length > 0;
                return (
                  <button
                    key={name}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onClick={() => void pickTable(name)}
                    className={cx(
                      'press animate-rise flex min-h-32 flex-col rounded-2xl border-2 p-3.5 text-left',
                      order ? 'border-accent/50 bg-accent/8' : active ? 'border-primary/50 bg-primary/8' : 'border-dashed border-line-strong bg-surface-2 hover:border-primary/40',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-lg font-extrabold tracking-tight">{name}</span>
                      <span
                        className={cx(
                          'grid size-8 place-items-center rounded-xl',
                          order ? 'bg-grad-accent text-white' : active ? 'bg-grad-primary text-white' : 'bg-surface text-fg-subtle',
                        )}
                      >
                        {order || active ? <Utensils className="size-4" /> : <Plus className="size-4" />}
                      </span>
                    </span>
                    {order ? (
                      <span className="mt-auto pt-2">
                        <span className="block truncate text-sm font-semibold">{order.label}</span>
                        <span className="block text-xs text-fg-muted">
                          {items(order)} item{order.pax ? ` · ${order.pax} tamu` : ''}
                        </span>
                        <span className="mt-1 flex items-center justify-between">
                          <span className="font-bold tabular">{formatNumber(total(order))}</span>
                          <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                            <Clock3 className="size-3.5" /> {waited(order.savedAt, now)}
                          </span>
                        </span>
                      </span>
                    ) : active ? (
                      <span className="mt-auto pt-2 text-sm font-semibold text-primary">Sedang dibuka di kasir</span>
                    ) : (
                      <span className="mt-auto pt-2 text-sm text-fg-subtle">Kosong · ketuk untuk pesanan baru</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <h2 className="mb-2 font-bold">Pesanan belum dibayar ({saved.length})</h2>
          {!saved.length ? (
            <Empty icon={<ClipboardList className="size-8" />} title="Belum ada pesanan tersimpan">
              Tekan “Simpan” di keranjang kasir untuk menahan pesanan yang belum dibayar.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...saved].reverse().map((o) => (
                <li key={o.id} className="animate-rise flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
                  <span className="bg-grad-accent grid size-11 shrink-0 place-items-center rounded-xl text-white">
                    {o.tableName ? <Utensils className="size-5" /> : <ClipboardList className="size-5" />}
                  </span>
                  <button className="min-h-12 min-w-40 flex-1 text-left" onClick={() => open(o.id)}>
                    <span className="block font-bold">{o.label}</span>
                    <span className="block text-sm text-fg-muted">
                      {ORDER_TYPE_LABEL[o.orderType]} · {o.tableName || 'Tanpa meja'}
                      {o.pax ? ` · ${o.pax} tamu` : ''} · {items(o)} item
                    </span>
                  </button>
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                    <Clock3 className="size-3.5" /> {waited(o.savedAt, now)}
                  </span>
                  <span className="w-24 text-right font-bold tabular">{formatRupiah(total(o))}</span>
                  <Button size="sm" onClick={() => open(o.id)}>
                    Buka
                  </Button>
                  <button aria-label={`Batalkan ${o.label}`} onClick={() => setCancelId(o.id)} className="press grid size-10 place-items-center rounded-xl text-fg-subtle hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-surface shadow-card">
          <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center gap-2 p-4 text-left font-bold">
            <History className="size-5 text-fg-muted" /> Log pembatalan & pemindahan
            <span className="text-sm font-normal text-fg-muted">({events.length})</span>
            <ChevronDown className={cx('ml-auto size-5 transition-transform', showLog && 'rotate-180')} />
          </button>
          {showLog && (
            <ul className="divide-y divide-line px-4 pb-3">
              {[...events].reverse().map((event, i) => (
                <li key={i} className="py-3 text-sm">
                  <b>{event.action}</b>
                  <p className="text-fg-muted">
                    {formatDateTime(event.at, data.settings.store.timezone)} · {event.actor || 'Operator'}
                  </p>
                  {event.reason && <p>Alasan: {event.reason}</p>}
                </li>
              ))}
              {!events.length && <li className="py-3 text-sm text-fg-muted">Belum ada log. Tablet menyimpan 100 aksi terakhir.</li>}
            </ul>
          )}
        </section>

        {cancelId && (
          <CancellationSheet
            kind="order"
            title="Batalkan pesanan tersimpan?"
            onClose={() => setCancelId(null)}
            onSubmit={(reason) => {
              deleteSaved(cancelId, reason);
              setCancelId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Summary({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'primary' | 'accent' | 'muted' }) {
  const t = { primary: 'bg-primary/10 text-primary', accent: 'bg-accent/12 text-accent', muted: 'bg-surface-3 text-fg-muted' }[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', t)}>{icon}</span>
      <span>
        <span className="block text-2xl leading-none font-extrabold tabular">{value}</span>
        <span className="text-xs text-fg-muted">{label}</span>
      </span>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('size-3 rounded ring-1', className)} /> {label}
    </span>
  );
}
