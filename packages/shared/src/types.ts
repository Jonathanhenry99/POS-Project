// Tipe data yang dipakai bersama oleh web (tablet/HP) dan server.
// Semua nilai uang dalam rupiah bulat (integer), tanpa desimal.

export type Role = 'owner' | 'kasir' | 'barista' | 'kitchen';

export type PaymentMethod = 'cash' | 'qris' | 'card';

export type Station = 'bar' | 'kitchen' | 'umum';

export type RoundingMode = 'none' | 'down' | 'nearest';

export type OrderType = 'dine_in' | 'take_away';

// ---------- Pengaturan toko (disimpan di server, di-cache di tablet) ----------

export interface StoreSettings {
  name: string;
  address: string;
  phone: string;
  footer: string;
  timezone: string;
}

export interface PricingSettings {
  serviceEnabled: boolean;
  servicePct: number;
  taxEnabled: boolean;
  taxPct: number;
  taxLabel: string;
  roundingMode: RoundingMode;
  roundingUnit: number;
}

export interface PolicySettings {
  /** Jika aktif, kasir butuh PIN owner untuk membatalkan (void) transaksi. */
  voidRequiresOwnerPin: boolean;
  /** Batas diskon (persen dari subtotal) yang boleh diberikan kasir tanpa PIN owner. 100 = bebas. */
  maxCashierDiscountPct: number;
  /** Jumlah tablet kasir aktif maksimal. Kasir hanya bisa berjualan dari tablet yang diaktifkan owner. */
  maxDevices: number;
}

export interface AppSettings {
  store: StoreSettings;
  pricing: PricingSettings;
  policy: PolicySettings;
  /** Master kasir opsional; data lama tetap memakai alur existing. */
  pos?: PosSettings;
}

export interface PosSettings {
  tables: string[];
  notes: { text: string; categoryId: string | null }[];
  cancellationReasons: { text: string; kind: 'menu' | 'order' | 'void' }[];
  productStations: Record<string, Station>;
}

// ---------- Katalog menu ----------

export interface Category {
  id: string;
  name: string;
  sort: number;
  active: boolean;
}

export interface MenuOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  active: boolean;
  sort: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  /** true = boleh pilih lebih dari satu (add-on); false = pilih satu (varian/ukuran). */
  multi: boolean;
  required: boolean;
  sort: number;
  options: MenuOption[];
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  sku: string;
  price: number;
  active: boolean;
  soldOut: boolean;
  sort: number;
  optionGroupIds: string[];
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  station: Station;
  minStock: number;
  costPerUnit: number;
  active: boolean;
}

export interface Catalog {
  categories: Category[];
  products: Product[];
  optionGroups: OptionGroup[];
}

// ---------- Pengguna ----------

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
}

/** Pengguna yang di-cache di tablet kasir untuk login PIN saat offline. */
export interface CachedUser extends PublicUser {
  pinHash: string;
}

// ---------- Transaksi ----------

export interface OrderItemOption {
  optionId: string;
  groupName: string;
  name: string;
  priceDelta: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  basePrice: number;
  /** Harga satuan = harga dasar + semua tambahan opsi. */
  unitPrice: number;
  qty: number;
  options: OrderItemOption[];
  note: string;
  lineTotal: number;
}

export interface Discount {
  type: 'percent' | 'amount';
  value: number;
  reason: string;
}

export interface Totals {
  subtotal: number;
  discountAmount: number;
  serviceAmount: number;
  taxAmount: number;
  roundingAmount: number;
  total: number;
}

export interface Payment {
  method: PaymentMethod;
  amount: number;
  /** Uang yang diterima (tunai). Untuk non-tunai sama dengan amount. */
  tendered: number;
  change: number;
  reference: string;
}

export type OrderStatus = 'paid' | 'void';

export interface Order extends Totals {
  id: string;
  number: string;
  deviceId: string;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  createdAt: string;
  customerName: string;
  orderType: OrderType;
  tableName?: string;
  pax?: number;
  items: OrderItem[];
  discount: Discount | null;
  /** Snapshot tarif saat transaksi, supaya struk lama tetap konsisten bila pengaturan berubah. */
  servicePct: number;
  taxPct: number;
  taxLabel: string;
  payment: Payment;
  status: OrderStatus;
  voidReason: string;
  voidedAt: string | null;
  voidedById: string | null;
  voidedByName: string;
  voidApprovedById: string | null;
}

// ---------- Shift / tutup kasir ----------

export interface CashMovement {
  id: string;
  type: 'in' | 'out';
  amount: number;
  note: string;
  at: string;
  userName: string;
}

export interface ShiftSummary {
  orderCount: number;
  voidCount: number;
  voidAmount: number;
  grossSales: number;
  discountTotal: number;
  serviceTotal: number;
  taxTotal: number;
  netSales: number;
  byMethod: Record<PaymentMethod, number>;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
}

export interface Shift {
  id: string;
  deviceId: string;
  openedById: string;
  openedByName: string;
  openedAt: string;
  openingCash: number;
  cashMovements: CashMovement[];
  closedById: string | null;
  closedByName: string;
  closedAt: string | null;
  countedCash: number | null;
  closingNote: string;
  summary: ShiftSummary | null;
  /** Metadata tambahan; shift lama tetap valid tanpa hari usaha. */
  businessDayId?: string;
  closeMode?: 'shift' | 'day';
}

/** Hari operasional satu terminal. Tidak mengganti tanggal kalender transaksi/laporan lama. */
export interface BusinessDay {
  id: string;
  deviceId: string;
  businessDate: string;
  openedAt: string;
  openedById: string;
  openedByName: string;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string;
  closingNote: string;
  shiftIds: string[];
  summary: BusinessDaySummary | null;
}

export interface BusinessDaySummary {
  shiftCount: number;
  orderCount: number;
  voidCount: number;
  voidAmount: number;
  grossSales: number;
  discountTotal: number;
  serviceTotal: number;
  taxTotal: number;
  netSales: number;
  byMethod: Record<PaymentMethod, number>;
  cashIn: number;
  cashOut: number;
  /** Modal hanya shift pertama; modal tiap shift tidak dijumlah sebagai pendapatan. */
  openingCash: number;
  lastExpectedCash: number;
  lastCountedCash: number | null;
  cashDifference: number;
}

// ---------- Stok ----------

export type StockMovementType = 'sale' | 'void' | 'purchase' | 'waste' | 'opname' | 'adjust';

export interface StockLevel extends Ingredient {
  stock: number;
  /** Rata-rata pemakaian per hari (7 hari terakhir). */
  avgDailyUsage: number;
  /** Perkiraan stok habis dalam N hari; null bila tidak ada pemakaian. */
  daysLeft: number | null;
  status: 'aman' | 'menipis' | 'habis';
}
