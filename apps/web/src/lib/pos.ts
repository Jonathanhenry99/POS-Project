// Logika kasir di tablet: transaksi, nomor struk, void, dan shift. Semua tersimpan lokal lebih dulu.
import {
  businessDate,
  computeShiftSummary,
  computeTotals,
  priceLine,
  type Discount,
  type OrderItem,
  type OrderItemOption,
  type OrderType,
  type PaymentMethod,
  type PricingSettings,
  type PublicUser,
  type Shift,
} from '@mourden/shared';
import { uuid } from './id';
import { db, kvGet, kvSet, type LocalOrder, type OutboxItem } from './idb';
import { appStore } from './state';
import { createStore, useStore } from './store';
import { flushOutbox, updateCounts } from './sync';

/** Naik setiap ada transaksi baru/void, agar ringkasan di layar ikut diperbarui. */
export const ordersVersion = createStore({ v: 0 });
const bumpOrders = () => ordersVersion.set((s) => ({ v: s.v + 1 }));
export const useOrdersVersion = () => useStore(ordersVersion, (s) => s.v);

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  basePrice: number;
  options: OrderItemOption[];
  qty: number;
  note: string;
}

export function cartItems(lines: CartLine[]): OrderItem[] {
  return lines.map((l) => ({
    id: l.key,
    productId: l.productId,
    name: l.name,
    basePrice: l.basePrice,
    qty: l.qty,
    options: l.options,
    note: l.note.trim(),
    ...priceLine(l.basePrice, l.options, l.qty),
  }));
}

export function cartTotals(lines: CartLine[], discount: Discount | null, pricing: PricingSettings) {
  const items = cartItems(lines);
  return { items, ...computeTotals(items, discount, pricing) };
}

function requireContext() {
  const s = appStore.get();
  if (!s.device || !s.data) throw new Error('Perangkat kasir belum siap');
  if (!s.user) throw new Error('Silakan login');
  if (!s.activeShift) throw new Error('Buka shift dulu sebelum berjualan');
  return { device: s.device, data: s.data, user: s.user, shift: s.activeShift };
}

function outboxItem(partial: Pick<OutboxItem, 'method' | 'path' | 'body' | 'operatorId' | 'label' | 'ref'>): OutboxItem {
  return { ...partial, createdAt: new Date().toISOString(), attempts: 0, lastError: '', status: 'pending' };
}

export interface CheckoutInput {
  lines: CartLine[];
  discount: Discount | null;
  customerName: string;
  orderType: OrderType;
  method: PaymentMethod;
  /** Uang diterima (tunai). */
  tendered: number;
  reference: string;
}

/**
 * Menyimpan transaksi ke tablet (nomor struk + transaksi + antrean sinkron dalam satu transaksi IndexedDB),
 * lalu mencoba mengirim ke server di latar belakang. Tidak bergantung pada internet maupun printer.
 */
export async function checkout(input: CheckoutInput): Promise<LocalOrder> {
  const { device, data, user, shift } = requireContext();
  if (!input.lines.length) throw new Error('Keranjang masih kosong');
  const pricing = data.settings.pricing;
  const { items, ...totals } = cartTotals(input.lines, input.discount, pricing);
  const tendered = input.method === 'cash' ? input.tendered : totals.total;
  if (input.method === 'cash' && tendered < totals.total) throw new Error('Uang diterima kurang dari total');

  const now = new Date().toISOString();
  const date = businessDate(now, data.settings.store.timezone);
  const d = await db();
  const tx = d.transaction(['kv', 'orders', 'outbox'], 'readwrite');
  const seqKey = `seq:${date}`;
  const seq = (((await tx.objectStore('kv').get(seqKey)) as number | undefined) ?? 0) + 1;
  const order: LocalOrder = {
    id: uuid(),
    number: `${device.code}${date.slice(2).replace(/-/g, '')}-${String(seq).padStart(3, '0')}`,
    deviceId: device.id,
    shiftId: shift.id,
    cashierId: user.id,
    cashierName: user.name,
    createdAt: now,
    customerName: input.customerName.trim(),
    orderType: input.orderType,
    items,
    discount: input.discount && totals.discountAmount > 0 ? input.discount : null,
    servicePct: pricing.serviceEnabled ? pricing.servicePct : 0,
    taxPct: pricing.taxEnabled ? pricing.taxPct : 0,
    taxLabel: pricing.taxLabel,
    ...totals,
    payment: {
      method: input.method,
      amount: totals.total,
      tendered,
      change: tendered - totals.total,
      reference: input.reference.trim(),
    },
    status: 'paid',
    voidReason: '',
    voidedAt: null,
    voidedById: null,
    voidedByName: '',
    voidApprovedById: null,
    sync: 'pending',
    syncError: '',
  };
  const { sync: _s, syncError: _e, ...body } = order;
  await Promise.all([
    tx.objectStore('kv').put(seq, seqKey),
    tx.objectStore('orders').put(order),
    tx.objectStore('outbox').add(
      outboxItem({ method: 'PUT', path: `/orders/${order.id}`, body, operatorId: user.id, label: `Transaksi ${order.number}`, ref: { store: 'orders', id: order.id } }),
    ),
  ]);
  await tx.done;
  bumpOrders();
  await updateCounts();
  void flushOutbox();
  return order;
}

/**
 * Membatalkan transaksi (bisa offline). Permintaan void selalu masuk antrean sebagai item terpisah;
 * urutan antrean menjamin transaksinya sudah terkirim lebih dulu, dan server mengembalikan stok bahan.
 */
export async function voidOrder(order: LocalOrder, reason: string, approvedBy: PublicUser | null): Promise<LocalOrder> {
  const user = appStore.get().user;
  if (!user) throw new Error('Silakan login');
  const voided: LocalOrder = {
    ...order,
    status: 'void',
    voidReason: reason.trim(),
    voidedAt: new Date().toISOString(),
    voidedById: user.id,
    voidedByName: user.name,
    voidApprovedById: approvedBy?.id ?? null,
    sync: 'pending',
    syncError: '',
  };
  const d = await db();
  const tx = d.transaction(['orders', 'outbox'], 'readwrite');
  await tx.objectStore('outbox').add(
    outboxItem({
      method: 'POST',
      path: `/orders/${order.id}/void`,
      body: {
        reason: voided.voidReason,
        voidedAt: voided.voidedAt,
        voidedById: user.id,
        voidedByName: user.name,
        approvedById: voided.voidApprovedById,
      },
      operatorId: user.id,
      label: `Void ${order.number}`,
      ref: { store: 'orders', id: order.id },
    }),
  );
  await tx.objectStore('orders').put(voided);
  await tx.done;
  bumpOrders();
  await updateCounts();
  void flushOutbox();
  return voided;
}

export async function listOrders(opts: { shiftId?: string; limit?: number } = {}): Promise<LocalOrder[]> {
  const d = await db();
  const list = opts.shiftId ? await d.getAllFromIndex('orders', 'byShift', opts.shiftId) : await d.getAllFromIndex('orders', 'byCreatedAt');
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return opts.limit ? list.slice(0, opts.limit) : list;
}

/** Hapus transaksi lokal yang sudah tersinkron dan lebih tua dari 45 hari (data tetap ada di server). */
export async function pruneOldOrders() {
  const d = await db();
  const cutoff = new Date(Date.now() - 45 * 86400_000).toISOString();
  const tx = d.transaction('orders', 'readwrite');
  for await (const cursor of tx.store.index('byCreatedAt').iterate(IDBKeyRange.upperBound(cutoff))) {
    if (cursor.value.sync === 'synced') await cursor.delete();
  }
  await tx.done;
}

// ---------- Shift ----------

export async function loadActiveShift() {
  const id = await kvGet<string>('activeShiftId');
  const shift = id ? ((await (await db()).get('shifts', id)) ?? null) : null;
  appStore.set({ activeShift: shift });
}

async function saveShift(shift: Shift, label: string) {
  const user = appStore.get().user!;
  const d = await db();
  const tx = d.transaction(['shifts', 'outbox'], 'readwrite');
  await tx.objectStore('shifts').put({ ...shift, sync: 'pending' });
  await tx.objectStore('outbox').add(
    outboxItem({ method: 'PUT', path: `/shifts/${shift.id}`, body: shift, operatorId: user.id, label, ref: { store: 'shifts', id: shift.id } }),
  );
  await tx.done;
  await updateCounts();
  void flushOutbox();
}

export async function openShift(openingCash: number) {
  const s = appStore.get();
  if (!s.user || !s.device) throw new Error('Silakan login');
  if (s.activeShift) return s.activeShift;
  const shift: Shift = {
    id: uuid(),
    deviceId: s.device.id,
    openedById: s.user.id,
    openedByName: s.user.name,
    openedAt: new Date().toISOString(),
    openingCash,
    cashMovements: [],
    closedById: null,
    closedByName: '',
    closedAt: null,
    countedCash: null,
    closingNote: '',
    summary: null,
  };
  await saveShift(shift, 'Buka shift');
  await kvSet('activeShiftId', shift.id);
  appStore.set({ activeShift: shift });
  return shift;
}

export async function addCashMovement(type: 'in' | 'out', amount: number, note: string) {
  const s = appStore.get();
  if (!s.activeShift || !s.user) throw new Error('Tidak ada shift aktif');
  const shift: Shift = {
    ...s.activeShift,
    cashMovements: [
      ...s.activeShift.cashMovements,
      { id: uuid(), type, amount, note: note.trim(), at: new Date().toISOString(), userName: s.user.name },
    ],
  };
  await saveShift(shift, type === 'in' ? 'Kas masuk' : 'Kas keluar');
  appStore.set({ activeShift: shift });
}

export async function currentShiftSummary() {
  const shift = appStore.get().activeShift;
  if (!shift) return null;
  return computeShiftSummary(shift, await listOrders({ shiftId: shift.id }));
}

export async function closeShift(countedCash: number, note: string): Promise<Shift> {
  const s = appStore.get();
  if (!s.activeShift || !s.user) throw new Error('Tidak ada shift aktif');
  const summary = computeShiftSummary(s.activeShift, await listOrders({ shiftId: s.activeShift.id }));
  const closed: Shift = {
    ...s.activeShift,
    closedById: s.user.id,
    closedByName: s.user.name,
    closedAt: new Date().toISOString(),
    countedCash,
    closingNote: note.trim(),
    summary,
  };
  await saveShift(closed, 'Tutup shift');
  await kvSet('activeShiftId', null);
  await kvSet('lastClosedShiftId', closed.id);
  appStore.set({ activeShift: null });
  return closed;
}

export async function lastClosedShift(): Promise<Shift | null> {
  const id = await kvGet<string>('lastClosedShiftId');
  return id ? ((await (await db()).get('shifts', id)) ?? null) : null;
}
