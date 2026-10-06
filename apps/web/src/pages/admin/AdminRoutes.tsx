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
  Receipt,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { userLabel } from '@mourden/shared';
import { cx } from '../../components/ui';
import { logout } from '../../lib/session';
import { BrandLogo } from '../../components/BrandLogo';
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

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.filter((g) => g.items).map((g) => [g.label, g.items!.some((i) => pathname.startsWith(i.to))])),
  );
  const link = ({ isActive }: { isActive: boolean }) =>
    cx('press flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold', isActive ? 'bg-primary/10 text-primary' : 'text-fg hover:bg-surface-2');
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((g) =>
        g.to ? (
          <NavLink key={g.label} to={g.to} end={g.to === '/admin'} className={link} onClick={onNavigate}>
            <g.icon className="size-5" /> {g.label}
          </NavLink>
        ) : (
          <div key={g.label}>
            <button
              onClick={() => setOpen((o) => ({ ...o, [g.label]: !o[g.label] }))}
              className={cx(
                'press flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold',
                g.items!.some((i) => pathname.startsWith(i.to)) ? 'text-primary' : 'text-fg hover:bg-surface-2',
              )}
            >
              <g.icon className="size-5" /> {g.label}
              <ChevronDown className={cx('ml-auto size-4 transition-transform', open[g.label] && 'rotate-180')} />
            </button>
            {open[g.label] && (
              <div className="animate-fade-in mt-0.5 mb-1 flex flex-col gap-0.5 pl-8">
                {g.items!.map((i) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.end}
                    onClick={onNavigate}
                    className={({ isActive }) => cx('flex h-10 items-center rounded-xl px-3 text-sm font-medium', isActive ? 'bg-primary/10 font-semibold text-primary' : 'text-fg-muted hover:bg-surface-2 hover:text-fg')}
                  >
                    {i.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo className="h-11 w-14 rounded-2xl" />
      <div className="leading-tight">
        <p className="text-[17px] font-extrabold tracking-tight">
          Mourden <span className="text-primary">POS</span>
        </p>
        <p className="text-xs text-fg-subtle">Back office</p>
      </div>
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
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Dashboard';
  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <SideNav />
        </div>
        <div className="flex flex-col gap-1 border-t border-line p-3">
          {mode === 'tablet' && (
            <Link to="/kasir" className="press bg-grad-success flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white">
              <Receipt className="size-5" /> Kembali ke kasir
            </Link>
          )}
          <button onClick={doLogout} className="press flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-fg-muted hover:bg-surface-2 hover:text-danger">
            <LogOut className="size-5" /> Keluar
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-grad-header relative shrink-0 text-white">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex h-16 items-center gap-3 px-4">
            <button aria-label="Menu" onClick={() => setDrawer(true)} className="press grid size-11 place-items-center rounded-xl bg-white/12 lg:hidden">
              <Menu className="size-5" />
            </button>
            <p className="flex min-w-0 items-center gap-1 truncate text-[15px] font-semibold">
              {title.split(' › ').map((part, i, arr) => (
                <span key={part} className={cx('flex items-center gap-1', i < arr.length - 1 && 'text-white/70')}>
                  {part}
                  {i < arr.length - 1 && <ChevronRight className="size-4" />}
                </span>
              ))}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {mode === 'tablet' && (
                <Link to="/kasir" className="press hidden h-10 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm font-semibold md:flex lg:hidden">
                  <Receipt className="size-4" /> Kasir
                </Link>
              )}
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/12 py-1.5 pr-3 pl-1.5">
                <BrandLogo className="h-9 w-11" />
                <div className="hidden leading-tight sm:block">
                  <p className="text-sm font-bold">{settings.data?.store.name ?? 'Mourden'}</p>
                  <p className="text-xs text-white/75">
                    {userLabel(user)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>
        {!online && mode === 'tablet' && <p className="bg-warning px-4 py-2 text-sm font-semibold text-on-warning">Offline: halaman admin butuh internet.</p>}
        <main className="min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div key={pathname} className="animate-fade-in">
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
          <div className="animate-rise flex h-full w-[82%] max-w-xs flex-col bg-surface shadow-card">
            <div className="flex items-center justify-between px-4 py-4">
              <Brand />
              <button aria-label="Tutup menu" onClick={() => setDrawer(false)} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3">
              <SideNav onNavigate={() => setDrawer(false)} />
            </div>
            <div className="border-t border-line p-3">
              <button onClick={doLogout} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-danger">
                <LogOut className="size-5" /> Keluar
              </button>
            </div>
          </div>
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-fg-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
