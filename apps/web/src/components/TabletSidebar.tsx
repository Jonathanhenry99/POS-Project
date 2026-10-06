import { Boxes, CalendarDays, History, LayoutDashboard, Printer, Receipt, RefreshCw, Utensils, Wallet, type LucideIcon } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { NavLink } from 'react-router';
import { can, ROLE_LABEL, type Permission } from '@mourden/shared';
import { useApp } from '../lib/state';
import { cx } from './ui';
import { Sidebar, SidebarProfile, SidebarToggle, useSidebarPreference } from './ui/sidebar';

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
  const [collapsed, setCollapsed, hoverEvents] = useSidebarPreference(PREF_KEY, typeof window !== 'undefined' && window.innerWidth < 1366);
  return <Sidebar {...hoverEvents} aria-label="Navigasi utama" collapsed={collapsed} className={cx('flex', collapsed ? 'w-[72px]' : 'w-56')}>
    <div className="sidebar-brand h-14">
      <BrandLogo className="size-10" />
      {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{storeName}</p><p className="text-[11px] text-neutral-500">Menu kasir</p></div>}
    </div>
    <nav id="tablet-navigation" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      {sections.map((section) => {
        const items = section.items.filter((item) => !item.permission || can(user.role, item.permission));
        if (!items.length) return null;
        return <section key={section.label} aria-label={section.label} className="mb-3">
          {collapsed ? <div className="sidebar-section-divider" title={section.label} /> : <p className="sidebar-section-label">{section.label}</p>}
          {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} title={label} aria-label={label} className="sidebar-link mb-1">
            <Icon className="size-5 shrink-0" />{!collapsed && <span>{label}</span>}
          </NavLink>)}
        </section>;
      })}
    </nav>
    <div className="sidebar-footer shrink-0 p-2">
      <SidebarToggle collapsed={collapsed} controls="tablet-navigation" onToggle={() => setCollapsed(!collapsed)} />
      <SidebarProfile name={user.name} role={ROLE_LABEL[user.role]} collapsed={collapsed} />
    </div>
  </Sidebar>;
}
