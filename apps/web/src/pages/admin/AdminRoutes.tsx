import { BarChart3, Boxes, ClipboardList, Coffee, LayoutDashboard, LogOut, Receipt, ScrollText, Settings, Users, Wallet } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router';
import { cx } from '../../components/ui';
import { logout } from '../../lib/session';
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

const NAV = [
  { to: '/admin', label: 'Beranda', icon: LayoutDashboard, end: true, mobile: true },
  { to: '/admin/laporan', label: 'Laporan', icon: BarChart3, mobile: true },
  { to: '/admin/transaksi', label: 'Transaksi', icon: Receipt, mobile: true },
  { to: '/admin/shift', label: 'Tutup kasir', icon: Wallet },
  { to: '/admin/stok', label: 'Stok', icon: Boxes, mobile: true },
  { to: '/admin/menu', label: 'Menu', icon: Coffee },
  { to: '/admin/resep', label: 'Resep & HPP', icon: ScrollText },
  { to: '/admin/pengguna', label: 'Pengguna', icon: Users },
  { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings, mobile: true },
];

export default function AdminRoutes() {
  const user = useApp((s) => s.user)!;
  const mode = useApp((s) => s.mode);
  const online = useApp((s) => s.online);
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col bg-brand-900 text-brand-100 md:flex">
        <div className="px-4 py-4">
          <p className="text-lg font-extrabold text-white">Admin</p>
          <p className="text-sm">{user.name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold', isActive ? 'bg-white text-brand-900' : 'hover:bg-white/10')}>
              <Icon className="size-5" /> {label}
            </NavLink>
          ))}
          <NavLink to="/stok" className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-white/10">
            <ClipboardList className="size-5" /> Opname
          </NavLink>
        </nav>
        <div className="flex flex-col gap-1 p-2">
          {mode === 'tablet' && (
            <Link to="/kasir" className="flex h-11 items-center gap-3 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white">
              <Receipt className="size-5" /> Kembali ke kasir
            </Link>
          )}
          <button
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-white/10"
          >
            <LogOut className="size-5" /> Keluar
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between bg-brand-900 px-4 text-white md:hidden">
          <span className="font-extrabold">Admin · {user.name}</span>
          <div className="flex items-center gap-1">
            {mode === 'tablet' && (
              <Link to="/kasir" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold">
                Kasir
              </Link>
            )}
            <button
              aria-label="Keluar"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="grid size-11 place-items-center"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>
        {!online && mode === 'tablet' && <p className="bg-amber-500 px-4 py-2 text-sm font-semibold">Offline: halaman admin butuh internet.</p>}
        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="laporan" element={<ReportsPage />} />
            <Route path="transaksi" element={<TransactionsPage />} />
            <Route path="shift" element={<ShiftsPage />} />
            <Route path="stok" element={<InventoryPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="resep" element={<RecipesPage />} />
            <Route path="pengguna" element={<UsersPage />} />
            <Route path="pengaturan" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.filter((n) => n.mobile).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive ? 'text-brand-800' : 'text-stone-500')}>
              <Icon className="size-6" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** Judul halaman admin + aksi di kanan. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-stone-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
