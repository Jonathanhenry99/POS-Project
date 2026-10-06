import { Boxes, CloudOff, CloudUpload, History, LayoutDashboard, Lock, Printer, Receipt, RefreshCw, Wallet, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { can, ROLE_LABEL } from '@mourden/shared';
import { cx } from '../components/ui';
import { logout } from '../lib/session';
import { appStore, useApp } from '../lib/state';
import { DRIVERS, usePrintStatus, usePrinterConfig } from '../printing/service';

const OWNER_IDLE_LOCK_MS = 10 * 60_000;

export function TabletShell() {
  const user = useApp((s) => s.user)!;
  const storeName = useApp((s) => s.data?.settings.store.name);
  const navigate = useNavigate();

  // Owner yang lupa keluar di tablet otomatis terkunci setelah 10 menit tidak ada aktivitas.
  useEffect(() => {
    if (user.role !== 'owner') return;
    let last = Date.now();
    const touch = () => (last = Date.now());
    window.addEventListener('pointerdown', touch);
    const timer = setInterval(() => {
      if (Date.now() - last > OWNER_IDLE_LOCK_MS && appStore.get().user?.role === 'owner') {
        logout();
        navigate('/login', { replace: true });
      }
    }, 30_000);
    return () => {
      window.removeEventListener('pointerdown', touch);
      clearInterval(timer);
    };
  }, [user.role, navigate]);

  const tab = ({ isActive }: { isActive: boolean }) =>
    cx('flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold', isActive ? 'bg-white text-brand-900' : 'text-brand-100 hover:bg-white/10');

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-brand-900 px-3 text-white">
        <span className="mr-2 hidden max-w-40 truncate text-lg font-extrabold md:block">{storeName}</span>
        <nav className="flex gap-1">
          <NavLink to="/kasir" className={tab}>
            <Receipt className="size-5" /> Kasir
          </NavLink>
          <NavLink to="/riwayat" className={tab}>
            <History className="size-5" /> Riwayat
          </NavLink>
          <NavLink to="/shift" className={tab}>
            <Wallet className="size-5" /> Shift
          </NavLink>
          {can(user.role, 'stock.opname') && (
            <NavLink to="/stok" className={tab}>
              <Boxes className="size-5" /> Stok
            </NavLink>
          )}
          {can(user.role, 'admin') && (
            <NavLink to="/admin" className={tab}>
              <LayoutDashboard className="size-5" /> Admin
            </NavLink>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SyncPill />
          <PrinterPill />
          <button
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className="flex h-11 items-center gap-2 rounded-xl px-3 text-left hover:bg-white/10"
            title="Kunci / ganti kasir"
          >
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold">{user.name}</span>
              <span className="block text-xs text-brand-200">{ROLE_LABEL[user.role]}</span>
            </span>
            <Lock className="size-5" />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function SyncPill() {
  const online = useApp((s) => s.online);
  const sync = useApp((s) => s.sync);
  const label = !online ? 'Offline' : sync.pending ? `${sync.pending} antre` : 'Online';
  return (
    <NavLink
      to="/sinkron"
      title="Status sinkronisasi"
      className={cx(
        'flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold',
        !online ? 'bg-amber-500 text-stone-950' : sync.failed ? 'bg-red-600' : 'hover:bg-white/10',
      )}
    >
      {!online ? <CloudOff className="size-5" /> : sync.syncing ? <RefreshCw className="size-5 animate-spin" /> : sync.pending ? <CloudUpload className="size-5" /> : <Wifi className="size-5" />}
      <span className="hidden lg:inline">{sync.failed ? `${sync.failed} gagal` : label}</span>
    </NavLink>
  );
}

function PrinterPill() {
  const status = usePrintStatus();
  const config = usePrinterConfig();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const driver = DRIVERS.find((d) => d.id === config.driver);
  const error = status.state === 'error';
  return (
    <NavLink
      to="/printer"
      title={`Printer: ${driver?.label}`}
      className={cx('flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold', error ? 'bg-red-600' : 'hover:bg-white/10')}
    >
      <Printer className="size-5" />
      <span className="hidden lg:inline">{error ? 'Gagal cetak' : status.state === 'printing' ? 'Mencetak…' : 'Printer'}</span>
    </NavLink>
  );
}
