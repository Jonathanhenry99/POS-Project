// Mengirim aktivitas kasir yang berisiko (cetak tagihan, hapus pesanan, kurangi item setelah tagihan) ke server
// lewat antrean offline yang sama dengan transaksi, sehingga tetap tercatat walau internet putus.
import type { CashierEvent } from '@mourden/shared';
import { setCartReporter } from '../pages/pos/cart';
import { uuid } from './id';
import { appStore } from './state';
import { enqueue } from './sync';

export function reportCashierEvent(e: Omit<CashierEvent, 'id' | 'at'>) {
  const user = appStore.get().user;
  if (!user) return;
  const event: CashierEvent = { ...e, label: e.label.slice(0, 80), reason: e.reason.slice(0, 200), detail: e.detail.slice(0, 300), id: uuid(), at: new Date().toISOString() };
  void enqueue({ method: 'PUT', path: `/tablet/events/${event.id}`, body: event, operatorId: user.id, label: 'Log aktivitas kasir', ref: null }).catch(() => {});
}

setCartReporter(reportCashierEvent);
