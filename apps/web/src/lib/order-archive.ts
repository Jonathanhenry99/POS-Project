import type { Order } from '@mourden/shared';
import { api } from './api';
import { db, type LocalOrder } from './idb';

export interface ArchiveCursor { at: string; id: string }
export async function fetchOrderArchive(query: { from: string; to: string; q: string; status: string; payment: string }, cursor: ArchiveCursor | null = null) {
  const params = new URLSearchParams(query);
  if (cursor) { params.set('cursorAt', cursor.at); params.set('cursorId', cursor.id); }
  const result = await api<{ orders: Order[]; next: ArchiveCursor | null }>(`/tablet/orders?${params}`);
  const d = await db();
  const tx = d.transaction(['orders', 'outbox'], 'readwrite');
  const jobs = await tx.objectStore('outbox').getAll();
  const orders: LocalOrder[] = [];
  for (const o of result.orders) {
    const local = await tx.objectStore('orders').get(o.id);
    // Void/order yang belum terkirim tidak boleh ditimpa hasil server yang lebih lama.
    const pending = local && (local.sync !== 'synced' || jobs.some((j) => j.ref?.store === 'orders' && j.ref.id === o.id));
    const merged: LocalOrder = pending ? local : { ...o, sync: 'synced', syncError: '' };
    if (!pending) await tx.objectStore('orders').put(merged);
    orders.push(merged);
  }
  await tx.done;
  return { orders, next: result.next };
}
