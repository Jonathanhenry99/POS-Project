import type { AppSettings, ReceiptSettings } from './types';

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  showLogo: true,
  logoSize: 'medium',
  logoDarkness: 'normal',
  showStoreName: true,
  headerNote: '',
  showCashier: true,
  showCustomer: true,
  showOrderType: true,
  showItemOptions: true,
  showItemNotes: true,
  showItemCount: false,
};

/** Pengaturan awal. Semua bisa diubah owner di menu Pengaturan. */
export const DEFAULT_SETTINGS: AppSettings = {
  store: {
    name: 'MOURDEN',
    address: '',
    phone: '',
    footer: 'Terima kasih!',
    timezone: 'Asia/Jakarta',
  },
  pricing: {
    serviceEnabled: true,
    servicePct: 5,
    taxEnabled: false,
    taxPct: 10,
    taxLabel: 'PB1',
    roundingMode: 'none',
    roundingUnit: 100,
  },
  policy: {
    voidRequiresOwnerPin: false,
    maxCashierDiscountPct: 100,
    maxDevices: 1,
  },
  pos: { tables: [], notes: [], cancellationReasons: [], productStations: {} },
  brand: { logo: '' },
  receipt: DEFAULT_RECEIPT_SETTINGS,
};

/** Menggabungkan pengaturan tersimpan dengan default, supaya kunci baru selalu terisi. */
export function mergeSettings(partial: Partial<{ [K in keyof AppSettings]: Partial<AppSettings[K]> }> | null | undefined): AppSettings {
  return {
    store: { ...DEFAULT_SETTINGS.store, ...partial?.store },
    pricing: { ...DEFAULT_SETTINGS.pricing, ...partial?.pricing },
    policy: { ...DEFAULT_SETTINGS.policy, ...partial?.policy },
    pos: { ...DEFAULT_SETTINGS.pos!, ...partial?.pos },
    brand: { ...DEFAULT_SETTINGS.brand!, ...partial?.brand },
    receipt: { ...DEFAULT_RECEIPT_SETTINGS, ...partial?.receipt },
  };
}
