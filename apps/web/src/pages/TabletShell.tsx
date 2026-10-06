import { Boxes, CloudOff, History, LayoutDashboard, Lock, Printer, Receipt, RefreshCw, Store, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { can, formatNumber, userLabel } from '@mourden/shared';
import { StatusDot, cx } from '../components/ui';
import { listOrders, useOrdersVersion } from '../lib/pos';
import { logout } from '../lib/session';
import { appStore, useApp } from '../lib/state';
import { usePrintStatus } from '../printing/service';
import { TabletSidebar } from '../components/TabletSidebar';

const OWNER_IDLE_LOCK_MS = 10 * 60_000;

export function TabletShell() {
  const user = useApp((s) => s.user)!;
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

  return (
    <div className="flex h-full">
      <TabletSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="bg-grad-header relative shrink-0 text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex h-16 items-center gap-3 px-3">
          <StoreBlock />
          <div className="ml-auto flex items-center gap-2">
            <ShiftChip />
            <Clock />
            <SyncPill />
            <PrinterPill />
            <button
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="press grid size-11 place-items-center rounded-xl bg-white/12 hover:bg-white/20"
              title="Kunci / ganti kasir"
              aria-label="Kunci / ganti kasir"
            >
              <Lock className="size-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      </div>
    </div>
  );
}

function StoreBlock() {
  const user = useApp((s) => s.user)!;
  const storeName = useApp((s) => s.data?.settings.store.name);
  const shiftOpen = useApp((s) => !!s.activeShift);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
        <Store className="size-5" />
      </span>
      <div className="hidden min-w-0 leading-tight xl:block">
        <p className="truncate text-[15px] font-extrabold tracking-tight">{storeName}</p>
        <p className="flex items-center gap-1.5 text-xs text-white/80">
          {userLabel(user)} <span className="text-white/40">|</span>
          <span className={cx('italic', !shiftOpen && 'text-amber-200')}>{shiftOpen ? 'Shift Open' : 'Shift Close'}</span>
        </p>
      </div>
    </div>
  );
}

/** Ringkasan penjualan shift berjalan (dihitung di tablet, tetap jalan offline). */
function ShiftChip() {
  const shift = useApp((s) => s.activeShift);
  const version = useOrdersVersion();
  const [stats, setStats] = useState({ count: 0, total: 0 });
  useEffect(() => {
    if (!shift) return;
    void listOrders({ shiftId: shift.id }).then((list) => {
      const paid = list.filter((o) => o.status === 'paid');
      setStats({ count: paid.length, total: paid.reduce((s, o) => s + o.total, 0) });
    });
  }, [shift, version]);
  if (!shift) return null;
  return (
    <div className="hidden items-center gap-2 rounded-xl bg-white/12 px-3 py-1.5 leading-tight lg:flex" title="Penjualan shift ini">
      <div>
        <p className="text-[10px] font-semibold tracking-wider text-white/70 uppercase">Shift ini</p>
        <p key={stats.total} className="animate-fade-in text-sm font-bold tabular">
          {stats.count} trx · {formatNumber(stats.total)}
        </p>
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden text-right leading-tight md:block">
      <p className="text-[11px] text-white/75">{now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
      <p className="text-[15px] font-bold tabular">{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
    </div>
  );
}

function SyncPill() {
  const online = useApp((s) => s.online);
  const sync = useApp((s) => s.sync);
  const label = !online ? 'Offline' : sync.failed ? `${sync.failed} gagal` : sync.pending ? `${sync.pending} antre` : 'Online';
  return (
    <NavLink
      to="/sinkron"
      title="Status sinkronisasi"
      className={cx(
        'press flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold',
        !online ? 'bg-warning text-on-warning' : sync.failed ? 'bg-danger text-white' : 'bg-white text-success',
      )}
    >
      {!online ? (
        <CloudOff className="size-4" />
      ) : sync.syncing ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <StatusDot tone={sync.failed ? 'red' : sync.pending ? 'amber' : 'green'} pulse={!sync.failed} />
      )}
      {label}
    </NavLink>
  );
}

function PrinterPill() {
  const status = usePrintStatus();
  const error = status.state === 'error';
  return (
    <NavLink
      to="/printer"
      title="Printer"
      aria-label="Pengaturan printer"
      className={cx('press relative grid size-11 place-items-center rounded-xl', error ? 'bg-danger' : 'bg-white/12 hover:bg-white/20')}
    >
      <Printer className={cx('size-5', status.state === 'printing' && 'animate-pulse')} />
      {error && <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-white bg-danger" />}
    </NavLink>
  );
}
