import { Boxes, CalendarDays, History, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Printer, Receipt, RefreshCw, Utensils, Wallet, type LucideIcon } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { can, type Permission } from '@mourden/shared';
import { useApp } from '../lib/state';
import { cx } from './ui';

const PREF_KEY = 'mourden.sidebar.collapsed';
const sections: { label: string; items: { to: string; label: string; icon: LucideIcon; permission?: Permission }[] }[] = [
  { label: 'Penjualan', items: [
    { to: '/kasir', label: 'Kasir', icon: Receipt, permission: 'pos.sell' },
    { to: '/riwayat', label: 'Riwayat transaksi', icon: History, permission: 'pos.sell' },
    { to: '/meja', label: 'Meja & pesanan', icon: Utensils, permission: 'pos.sell' },
  ] },
  { label: 'Operasional', items: [
    { to: '/shift', label: 'Shift & kas', icon: Wallet, permission: 'pos.shift' },
    { to: '/hari', label: 'Ganti Shift / Hari', icon: CalendarDays, permission: 'pos.shift' },
    { to: '/stok', label: 'Stok', icon: Boxes, permission: 'stock.opname' },
  ] },
  { label: 'Perangkat', items: [
    { to: '/printer', label: 'Pengaturan printer', icon: Printer },
    { to: '/antrean-cetak', label: 'Antrean cetak', icon: Receipt },
    { to: '/sinkron', label: 'Sinkronisasi', icon: RefreshCw },
  ] },
  { label: 'Pengelolaan', items: [
    { to: '/admin', label: 'Admin', icon: LayoutDashboard, permission: 'admin' },
  ] },
];

export function TabletSidebar() {
  const user = useApp((s) => s.user)!;
  const storeName = useApp((s) => s.data?.settings.store.name ?? 'POS');
  const [collapsed, setCollapsed] = useState(() => {
    // Default: diperkecil di layar tablet (< 1366 px) agar grid menu & keranjang lega; pilihan kasir tetap diingat.
    try {
      const saved = localStorage.getItem(PREF_KEY);
      if (saved !== null) return saved === 'true';
    } catch { /* abaikan */ }
    return typeof window !== 'undefined' && window.innerWidth < 1366;
  });
  return <aside aria-label="Navigasi utama" className={cx('flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150 motion-reduce:transition-none', collapsed ? 'w-[72px]' : 'w-56')}>
    <div className={cx('flex h-14 shrink-0 items-center gap-3 border-b border-line px-3', collapsed && 'justify-center')}>
      <BrandLogo className="h-10 w-12" />
      {!collapsed && <div className="min-w-0"><p className="truncate font-extrabold">{storeName}</p><p className="text-xs text-fg-muted">Menu kasir</p></div>}
    </div>
    <nav id="tablet-navigation" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      {sections.map((section) => {
        const items = section.items.filter((item) => !item.permission || can(user.role, item.permission));
        if (!items.length) return null;
        return <section key={section.label} aria-label={section.label} className="mb-4">
          {collapsed ? <div className="mx-auto mb-2 h-px w-7 bg-line" title={section.label} /> : <p className="mb-1 px-3 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">{section.label}</p>}
          {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} title={label} aria-label={label} className={({ isActive }) => cx('press mb-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold', collapsed && 'justify-center', isActive ? 'bg-primary/12 text-primary ring-1 ring-primary/20' : 'text-fg-muted hover:bg-surface-2 hover:text-fg')}>
            <Icon className="size-5 shrink-0" />{!collapsed && <span>{label}</span>}
          </NavLink>)}
        </section>;
      })}
    </nav>
    <div className="shrink-0 border-t border-line p-2">
      <button aria-controls="tablet-navigation" aria-expanded={!collapsed} aria-label={collapsed ? 'Perluas menu kiri' : 'Perkecil menu kiri'} title={collapsed ? 'Perluas menu' : 'Perkecil menu'} className={cx('press flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-fg-muted hover:bg-surface-2', collapsed && 'justify-center')} onClick={() => {
        setCollapsed((value) => { const next = !value; try { localStorage.setItem(PREF_KEY, String(next)); } catch { /* tetap tersedia selama sesi */ } return next; });
      }}>
        {collapsed ? <PanelLeftOpen className="size-5" /> : <><PanelLeftClose className="size-5" /><span>Perkecil menu</span></>}
      </button>
    </div>
  </aside>;
}
