import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@mourden/shared';
import { db, resetDbForTests } from './idb';
import { checkout, compUsedToday, currentShiftSummary, openShift } from './pos';
import { appStore } from './state';

const owner = { id: '11111111-1111-4111-8111-111111111111', name: 'Owner', username: 'owner', role: 'owner' as const, active: true, pinHash: '' };
const kasir = { id: '22222222-2222-4222-8222-222222222222', name: 'Rina', username: 'rina', role: 'kasir' as const, active: true, pinHash: '' };
const barista = { id: '33333333-3333-4333-8333-333333333333', name: 'Budi', username: 'budi', role: 'barista' as const, active: true, pinHash: '' };
const line = (qty = 1) => [{ key: `l${Math.random()}`, productId: 'p1', name: 'Latte', basePrice: 25000, options: [], qty, note: '' }];
const base = { discount: null, customerName: '', orderType: 'take_away' as const, method: 'cash' as const, tendered: 0, reference: '' };

beforeEach(async () => {
  await resetDbForTests();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
  appStore.set({
    mode: 'tablet', preview: false, user: kasir, activeShift: null,
    device: { id: 'dev-1', name: 'Tablet', code: 'A', token: 't' },
    data: { settings: { ...DEFAULT_SETTINGS, comp: { enabled: true, perDay: 1, maxUnitPrice: 0 } }, catalog: { categories: [], products: [], optionGroups: [] }, ingredients: [], users: [owner, kasir, barista], fetchedAt: '' },
  });
  await openShift(100000);
});

it('komplimen: Rp 0 atas nama penerima, jatah harian ditegakkan, lebih jatah butuh persetujuan owner', async () => {
  const first = await checkout({ ...base, lines: line(), comp: { employeeId: barista.id, approvedById: null } });
  expect(first).toMatchObject({ total: 0, subtotal: 25000, discountAmount: 25000, serviceAmount: 0, comp: { employeeId: barista.id, employeeName: 'Budi', approvedById: null } });
  expect(first.discount).toMatchObject({ type: 'percent', value: 100, reason: 'Komplimen Budi' });
  expect(first.payment).toMatchObject({ method: 'cash', amount: 0, tendered: 0, change: 0 });
  expect(await compUsedToday(barista.id)).toBe(1);
  await expect(checkout({ ...base, lines: line(), comp: { employeeId: barista.id, approvedById: null } })).rejects.toThrow('Jatah komplimen Budi');
  const second = await checkout({ ...base, lines: line(), comp: { employeeId: barista.id, approvedById: owner.id } });
  expect(second.comp?.approvedById).toBe(owner.id);
  expect(await compUsedToday(barista.id)).toBe(2);
  // Karyawan lain masih punya jatahnya sendiri.
  expect(await compUsedToday(kasir.id)).toBe(0);
  const sent = (await (await db()).getAll('outbox')).filter((o) => o.path.startsWith('/orders/'));
  expect(sent.map((o) => (o.body as { comp?: { employeeName: string } }).comp?.employeeName)).toEqual(['Budi', 'Budi']);
});

it('komplimen tidak mengubah penjualan, diskon, maupun kas laci di rekap shift', async () => {
  await checkout({ ...base, lines: line(2), tendered: 100000 });
  const before = await currentShiftSummary();
  await checkout({ ...base, lines: line(), comp: { employeeId: barista.id, approvedById: null } });
  const after = await currentShiftSummary();
  expect(after).toMatchObject({ orderCount: before!.orderCount, netSales: before!.netSales, discountTotal: 0, expectedCash: before!.expectedCash, compCount: 1, compValue: 25000 });
});

it('komplimen ditolak bila dinonaktifkan atau menu melewati batas harga tanpa PIN owner', async () => {
  const s = appStore.get();
  appStore.set({ data: { ...s.data!, settings: { ...s.data!.settings, comp: { enabled: true, perDay: 3, maxUnitPrice: 20000 } } } });
  await expect(checkout({ ...base, lines: line(), comp: { employeeId: barista.id, approvedById: null } })).rejects.toThrow('butuh PIN owner');
  appStore.set({ data: { ...s.data!, settings: { ...s.data!.settings, comp: { enabled: false, perDay: 3, maxUnitPrice: 0 } } } });
  await expect(checkout({ ...base, lines: line(), comp: { employeeId: barista.id, approvedById: null } })).rejects.toThrow('dinonaktifkan');
  expect(await (await db()).count('orders')).toBe(0);
});
