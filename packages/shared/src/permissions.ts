import type { OrderType, PaymentMethod, Role, Station } from './types';

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

/** "Kasir Rina"; tidak mengulang peran bila nama sudah memuatnya (mis. "Kasir 1", "Owner"). */
export function userLabel(u: { name: string; role: Role }): string {
  const role = ROLE_LABEL[u.role];
  return u.name.toLowerCase().includes(role.toLowerCase()) ? u.name : `${role} ${u.name}`;
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  card: 'Debit/Kredit',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: 'Dine In',
  take_away: 'Take Away',
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
