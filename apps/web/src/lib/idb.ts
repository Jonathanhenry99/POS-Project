import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, BusinessDay, CachedUser, Catalog, Ingredient, Order, Shift } from '@mourden/shared';
import type { PrintJob } from '../printing/queue';

export interface DeviceInfo {
  id: string;
  name: string;
  code: string;
  token: string;
}

export interface BootstrapData {
  settings: AppSettings;
  catalog: Catalog;
  ingredients: Ingredient[];
  users: CachedUser[];
  fetchedAt: string;
}

export type SyncState = 'pending' | 'synced' | 'failed';

export interface LocalOrder extends Order {
  sync: SyncState;
  syncError: string;
}

export interface LocalBusinessDay extends BusinessDay {
  sync: SyncState;
  syncError: string;
}

export interface OutboxItem {
  seq?: number;
  method: 'PUT' | 'POST';
  path: string;
  body: unknown;
  /** Operator saat aksi dilakukan (bukan yang sedang login saat dikirim). */
  operatorId: string;
  label: string;
  createdAt: string;
  attempts: number;
  lastError: string;
  status: 'pending' | 'failed';
  /** Data lokal yang status sinkronnya ikut diperbarui. */
  ref: { store: 'orders' | 'shifts' | 'businessDays'; id: string } | null;
}

interface MourdenDB extends DBSchema {
  kv: { key: string; value: unknown };
  orders: { key: string; value: LocalOrder; indexes: { byCreatedAt: string; byShift: string } };
  shifts: { key: string; value: Shift & { sync: SyncState } };
  businessDays: { key: string; value: LocalBusinessDay };
  printJobs: { key: string; value: PrintJob };
  outbox: { key: number; value: OutboxItem; indexes: { byStatus: string } };
}

let dbPromise: Promise<IDBPDatabase<MourdenDB>> | null = null;

export function db() {
  dbPromise ??= openDB<MourdenDB>('mourden-pos', 3, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
      d.createObjectStore('kv');
      const orders = d.createObjectStore('orders', { keyPath: 'id' });
      orders.createIndex('byCreatedAt', 'createdAt');
      orders.createIndex('byShift', 'shiftId');
      d.createObjectStore('shifts', { keyPath: 'id' });
      const outbox = d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      outbox.createIndex('byStatus', 'status');
      }
      if (oldVersion < 2) d.createObjectStore('businessDays', { keyPath: 'id' });
      if (oldVersion < 3) d.createObjectStore('printJobs', { keyPath: 'id' });
    },
    blocking() { const prior = dbPromise; dbPromise = null; void prior?.then((connection) => connection.close()); },
  });
  return dbPromise;
}

/** Dipakai tes untuk mulai dari database kosong. */
export async function resetDbForTests() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('mourden-pos');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}

export async function kvDelete(key: string) {
  await (await db()).delete('kv', key);
}
