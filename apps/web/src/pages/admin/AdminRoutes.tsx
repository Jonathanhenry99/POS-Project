import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Coffee,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  Receipt,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { ROLE_LABEL, userLabel } from '@mourden/shared';
import { toast } from '../../components/feedback';
import { cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { enterPreview } from '../../lib/preview';
import { logout } from '../../lib/session';
import { BrandLogo } from '../../components/BrandLogo';
import { AppModeButton } from '../../components/AppModeButton';
import { Sidebar, SidebarProfile, SidebarToggle, useSidebarPreference } from '../../components/ui/sidebar';
import { useApp } from '../../lib/state';
import { DashboardPage } from './DashboardPage';
import { InventoryPage } from './InventoryPage';
import { MenuPage } from './MenuPage';
import { RecipesPage } from './RecipesPage';
import { ReportsPage } from './ReportsPage';
import { SettingsPage } from './SettingsPage';
import { ShiftsPage } from './ShiftsPage';
import { TransactionsPage } from './TransactionsPage';
import { UsersPage } from './UsersPage';
import { useApi } from './hooks';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}
interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  to?: string;
  items?: NavItem[];
}

const NAV: NavGroup[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/admin' },
  {
    label: 'Laporan',
    icon: BarChart3,
    items: [
      { to: '/admin/laporan', label: 'Rangkuman Penjualan', end: true },
      { to: '/admin/laporan/menu', label: 'Penjualan Menu' },
      { to: '/admin/laporan/pembayaran', label: 'Pembayaran' },
      { to: '/admin/laporan/void', label: 'Batal & Void' },
      { to: '/admin/laporan/laba', label: 'Laba Kotor' },
    ],
  },
  {
    label: 'Transaksi',
    icon: Receipt,
    items: [
      { to: '/admin/transaksi', label: 'Detail Penjualan' },
      { to: '/admin/shift', label: 'Tutup Kasir' },
    ],
  },
  {
    label: 'Inventori',
    icon: Boxes,
    items: [
      { to: '/admin/stok', label: 'Stok Bahan' },
      { to: '/admin/resep', label: 'Resep & HPP' },
      { to: '/stok', label: 'Stock Opname' },
    ],
  },
  { label: 'Pengaturan Menu', icon: Coffee, to: '/admin/menu' },
  { label: 'Hak Akses', icon: Users, to: '/admin/pengguna' },
  { label: 'Pengaturan', icon: Settings, to: '/admin/pengaturan' },
];

const TITLES: [prefix: string, title: string][] = [
  ['/admin/laporan/menu', 'Laporan › Penjualan Menu'],
  ['/admin/laporan/pembayaran', 'Laporan › Pembayaran'],
  ['/admin/laporan/void', 'Laporan › Batal & Void'],
  ['/admin/laporan/laba', 'Laporan › Laba Kotor'],
  ['/admin/laporan', 'Laporan › Rangkuman Penjualan'],
  ['/admin/transaksi', 'Transaksi › Detail Penjualan'],
  ['/admin/shift', 'Transaksi › Tutup Kasir'],
  ['/admin/stok', 'Inventori › Stok Bahan'],
  ['/admin/resep', 'Inventori › Resep & HPP'],
  ['/admin/menu', 'Pengaturan Menu'],
  ['/admin/pengguna', 'Hak Akses'],
  ['/admin/pengaturan', 'Pengaturan'],
  ['/admin', 'Dashboard'],
];

function SideNav({ onNavigate, collapsed = false, onExpand, id }: { onNavigate?: () => void; collapsed?: boolean; onExpand?: () => void; id: string }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.filter((g) => g.items).map((g) => [g.label, g.items!.some((i) => pathname.startsWith(i.to))])),
  );
  return (
    <nav id={id} aria-label="Navigasi back office" className="flex flex-col gap-1">
      {NAV.map((g, index) => (
        <Fragment key={g.label}>
          {(index === 0 || index === 3 || index === 5) && (collapsed ? <div className="sidebar-section-divider" /> : <p className="sidebar-section-label">{index === 0 ? 'Ringkasan bisnis' : index === 3 ? 'Operasional' : 'Manajemen'}</p>)}
        {g.to ? (
          <NavLink key={g.label} to={g.to} end={g.to === '/admin'} className="sidebar-link" title={g.label} aria-label={g.label} onClick={onNavigate}>
            <g.icon className="size-5 shrink-0" /> {!collapsed && <span>{g.label}</span>}
          </NavLink>
        ) : (
          <div key={g.label}>
            <button
              aria-expanded={!collapsed && !!open[g.label]}
              aria-controls={`${id}-${index}`}
              aria-label={g.label}
              title={g.label}
              onClick={() => {
                if (collapsed) onExpand?.();
                setOpen((o) => ({ ...o, [g.label]: collapsed || !o[g.label] }));
              }}
              className={cx('sidebar-link w-full', g.items!.some((i) => pathname.startsWith(i.to)) && 'sidebar-group-active')}
            >
              <g.icon className="size-5 shrink-0" /> {!collapsed && <><span>{g.label}</span><ChevronDown className={cx('ml-auto size-4 shrink-0 transition-transform', open[g.label] && 'rotate-180')} /></>}
            </button>
            {!collapsed && open[g.label] && (
              <div id={`${id}-${index}`} className="sidebar-submenu mt-1 mb-2 ml-[22px] flex flex-col gap-1 border-l border-neutral-200 pl-3">
                {g.items!.map((i) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.end}
                    onClick={onNavigate}
                    className="sidebar-link text-[13px]"
                  >
                    {i.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
        </Fragment>
      ))}
    </nav>
  );
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandLogo className="size-10" />
      {!collapsed && <div className="min-w-0 leading-tight">
        <p className="truncate text-[16px] font-semibold tracking-tight">
          Mourden POS
        </p>
        <p className="mt-1 text-[11px] text-neutral-500">Back office</p>
      </div>}
    </div>
  );
}

export default function AdminRoutes() {
  const user = useApp((s) => s.user)!;
  const mode = useApp((s) => s.mode);
  const online = useApp((s) => s.online);
  const settings = useApi<{ store: { name: string } }>('/settings');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed, hoverEvents] = useSidebarPreference('mourden.admin.sidebar.collapsed');
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Dashboard';
  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };
  const [opening, setOpening] = useState(false);
  // Owner di HP/laptop: coba layar kasir tanpa mengaktifkan perangkat (transaksi simulasi, tidak tersimpan).
  const openPreview = async () => {
    setOpening(true);
    try {
      await enterPreview();
      navigate('/kasir');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="admin-workspace flex h-full">
      <Sidebar {...hoverEvents} aria-label="Menu admin" collapsed={collapsed} className={cx('hidden lg:flex', collapsed ? 'w-[72px]' : 'w-64')}>
        <div className="sidebar-brand h-20">
          <Brand collapsed={collapsed} />
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-3">
          <SideNav id="admin-navigation" collapsed={collapsed} onExpand={() => setCollapsed(false)} />
        </div>
        <div className="sidebar-footer flex shrink-0 flex-col gap-1 p-2">
          {mode === 'tablet' && (
            <Link to="/kasir" className="sidebar-link" title="Kembali ke kasir" aria-label="Kembali ke kasir">
              <Receipt className="size-5 shrink-0" /> {!collapsed && <span>Kembali ke kasir</span>}
            </Link>
          )}
          {mode === 'online' && (
            <button onClick={() => void openPreview()} disabled={opening} className="sidebar-link w-full" title="Pratinjau kasir (simulasi)" aria-label="Pratinjau kasir">
              <MonitorSmartphone className="size-5 shrink-0" /> {!collapsed && <span>{opening ? 'Membuka…' : 'Pratinjau kasir'}</span>}
            </button>
          )}
          <button onClick={doLogout} className="sidebar-link w-full" title="Keluar" aria-label="Keluar">
            <LogOut className="size-5 shrink-0" /> {!collapsed && <span>Keluar</span>}
          </button>
          <SidebarToggle collapsed={collapsed} controls="admin-navigation" onToggle={() => setCollapsed(!collapsed)} />
          <SidebarProfile name={user.name} role={ROLE_LABEL[user.role]} collapsed={collapsed} />
        </div>
      </Sidebar>

      <div className="admin-main flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar relative shrink-0">
          <div className="relative flex h-20 items-center gap-3 px-4 lg:px-6">
            <button aria-label="Menu" onClick={() => setDrawer(true)} className="press grid size-12 place-items-center rounded-xl border border-line bg-surface lg:hidden">
              <Menu className="size-5" />
            </button>
            <p className="flex min-w-0 items-center gap-1 truncate text-[15px] font-semibold">
              {title.split(' › ').map((part, i, arr) => (
                <span key={part} className={cx('flex items-center gap-1', i < arr.length - 1 && 'text-fg-muted')}>
                  {part}
                  {i < arr.length - 1 && <ChevronRight className="size-4" />}
                </span>
              ))}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <AppModeButton light allowFullscreen={false} />
              {mode === 'tablet' && (
                <Link to="/kasir" className="press hidden h-12 items-center gap-2 rounded-xl bg-primary/10 px-3 text-sm font-semibold text-primary md:flex lg:hidden">
                  <Receipt className="size-4" /> Kasir
                </Link>
              )}
              <span className="hidden items-center gap-2 pr-3 text-xs font-medium text-fg-muted xl:flex"><span className={cx('size-2 rounded-full', online ? 'bg-success' : 'bg-warning')} />{online ? 'Online' : 'Offline'}</span>
              <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface py-1.5 pr-3 pl-1.5">
                <BrandLogo className="h-9 w-11" />
                <div className="hidden leading-tight sm:block">
                  <p className="text-sm font-bold">{settings.data?.store.name ?? 'Mourden'}</p>
                  <p className="text-xs text-fg-muted">
                    {userLabel(user)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>
        {!online && mode === 'tablet' && <p className="bg-warning px-4 py-2 text-sm font-semibold text-on-warning">Offline: halaman admin butuh internet.</p>}
        <main className="admin-content min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div key={pathname}>
            <Routes>
              <Route index element={<DashboardPage />} />
              <Route path="laporan/*" element={<ReportsPage />} />
              <Route path="transaksi" element={<TransactionsPage />} />
              <Route path="shift" element={<ShiftsPage />} />
              <Route path="stok" element={<InventoryPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="resep" element={<RecipesPage />} />
              <Route path="pengguna" element={<UsersPage />} />
              <Route path="pengaturan" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </main>
        <MobileNav onMore={() => setDrawer(true)} />
      </div>

      {drawer && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-black/40 lg:hidden" onPointerDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <Sidebar aria-label="Menu admin mobile" className="animate-rise flex w-[86%] max-w-xs shadow-card">
            <div className="flex items-center justify-between px-4 py-4">
              <Brand />
              <button aria-label="Tutup menu" onClick={() => setDrawer(false)} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3">
              <SideNav id="admin-mobile-navigation" onNavigate={() => setDrawer(false)} />
            </div>
            <div className="sidebar-footer p-2">
              {mode === 'tablet' && <Link to="/kasir" className="sidebar-link"><Receipt className="size-5" /> Kembali ke kasir</Link>}
              {mode === 'online' && (
                <button onClick={() => void openPreview()} disabled={opening} className="sidebar-link w-full">
                  <MonitorSmartphone className="size-5" /> {opening ? 'Membuka…' : 'Pratinjau kasir'}
                </button>
              )}
              <button onClick={doLogout} className="sidebar-link w-full">
                <LogOut className="size-5" /> Keluar
              </button>
              <SidebarProfile name={user.name} role={ROLE_LABEL[user.role]} />
            </div>
          </Sidebar>
        </div>
      )}
    </div>
  );
}

function MobileNav({ onMore }: { onMore: () => void }) {
  const item = ({ isActive }: { isActive: boolean }) =>
    cx('flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive ? 'text-primary' : 'text-fg-subtle');
  const links: [string, string, typeof LayoutDashboard, boolean][] = [
    ['/admin', 'Beranda', LayoutDashboard, true],
    ['/admin/laporan', 'Laporan', BarChart3, false],
    ['/admin/transaksi', 'Transaksi', Receipt, false],
    ['/admin/stok', 'Stok', ClipboardList, false],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {links.map(([to, label, Icon, end]) => (
        <NavLink key={to} to={to} end={end} className={item}>
          <Icon className="size-6" />
          {label}
        </NavLink>
      ))}
      <button onClick={onMore} className="flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-fg-subtle">
        <Menu className="size-6" />
        Lainnya
      </button>
    </nav>
  );
}

/** Judul halaman admin + aksi di kanan. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="admin-page-heading mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-fg-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
