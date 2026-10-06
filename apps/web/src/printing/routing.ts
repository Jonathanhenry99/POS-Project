import { checkerReceipt, ORDER_TYPE_LABEL, type Station } from '@mourden/shared';
import { kvGet, kvSet } from '../lib/idb';
import { appStore } from '../lib/state';
import { cartStore } from '../pages/pos/cart';
import { makePrintJob, storePrintJobs } from './queue';
import { printerProfilesStore } from './service';

export interface StationRoute { profileId: string; mode: 'order' | 'item' | 'quantity' }
export type StationRoutes = Partial<Record<Station, StationRoute>>;
export const STATION_LABEL: Record<Station, string> = { bar: 'Bar', kitchen: 'Dapur', umum: 'Umum' };
export const loadStationRoutes = () => kvGet<StationRoutes>('printer.stationRoutes').then((v) => v ?? {});
export const saveStationRoutes = (routes: StationRoutes) => kvSet('printer.stationRoutes', routes);

export async function queueChecker() {
  const cart = cartStore.get(); const data = appStore.get().data;
  if (!data || !cart.lines.length) throw new Error('Pesanan masih kosong');
  const routes = await loadStationRoutes(); const profiles = printerProfilesStore.get().list;
  const groups = new Map<Station, typeof cart.lines>();
  for (const line of cart.lines) {
    const station = data.settings.pos?.productStations[line.productId] ?? 'umum';
    groups.set(station, [...(groups.get(station) ?? []), line]);
  }
  const jobs = [];
  for (const [station, lines] of groups) {
    const route = routes[station]; const profile = profiles.find((p) => p.id === route?.profileId);
    if (!route || !profile) throw new Error(`Hubungkan station ${STATION_LABEL[station]} dengan profil printer dahulu.`);
    const ticketCount = route.mode === 'order' ? 1 : route.mode === 'item' ? lines.length : lines.reduce((sum, l) => sum + l.qty, 0);
    if (jobs.length + ticketCount > 200) throw new Error('Maksimal 200 tiket per pengiriman. Gunakan mode per pesanan/item untuk jumlah besar.');
    const batches = route.mode === 'order' ? [lines] : route.mode === 'item' ? lines.map((l) => [l]) : lines.flatMap((l) => Array.from({ length: l.qty }, () => [{ ...l, qty: 1 }]));
    for (const batch of batches) jobs.push(makePrintJob(`Checker ${STATION_LABEL[station]} · ${cart.tableName || cart.customerName || 'Pesanan'}`, checkerReceipt({ station: STATION_LABEL[station], customerName: cart.customerName, tableName: cart.tableName, pax: cart.pax, orderType: ORDER_TYPE_LABEL[cart.orderType], at: new Date().toISOString() }, batch, data.settings.store, { ...profile.config, openDrawer: false }), profile));
  }
  await storePrintJobs(jobs);
  return jobs;
}
