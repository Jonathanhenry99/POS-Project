import type { PaymentMethod, Role, Station } from './types';

export type Permission =
  | 'pos.sell'
  | 'pos.void'
  | 'pos.shift'
  | 'stock.opname'
  | 'stock.record'
  | 'admin';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['pos.sell', 'pos.void', 'pos.shift', 'stock.opname', 'stock.record', 'admin'],
  kasir: ['pos.sell', 'pos.void', 'pos.shift'],
  barista: ['stock.opname', 'stock.record'],
  kitchen: ['stock.opname', 'stock.record'],
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  kasir: 'Kasir',
  barista: 'Barista',
  kitchen: 'Kitchen',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  card: 'Debit/Kredit',
};

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'qris', 'card'];

export const STATION_LABEL: Record<Station, string> = {
  bar: 'Bar',
  kitchen: 'Kitchen',
  umum: 'Umum',
};

/** Stasiun default untuk opname sesuai peran. */
export function defaultStation(role: Role): Station {
  return role === 'kitchen' ? 'kitchen' : 'bar';
}
