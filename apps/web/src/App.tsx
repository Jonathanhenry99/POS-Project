import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { can, type Permission } from '@mourden/shared';
import { ConfirmHost, Toaster } from './components/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Button, Spinner } from './components/ui';
import { logout } from './lib/session';
import { useApp } from './lib/state';
import { ActivatePage } from './pages/Activate';
import { LoginPage } from './pages/Login';
import { TabletShell } from './pages/TabletShell';

// Halaman kasir dimuat langsung (harus cepat & tersedia offline); admin dimuat saat dibuka.
import { PosPage } from './pages/pos/PosPage';
// Semua chunk tetap di-precache PWA. Pemisahan ini mengurangi beban awal tablet saat membuka kasir.
const HistoryPage = lazy(() => import('./pages/pos/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ShiftPage = lazy(() => import('./pages/pos/ShiftPage').then((m) => ({ default: m.ShiftPage })));
const BusinessDayPage = lazy(() => import('./pages/pos/BusinessDayPage').then((m) => ({ default: m.BusinessDayPage })));
const TablesPage = lazy(() => import('./pages/pos/TablesPage').then((m) => ({ default: m.TablesPage })));
const PrinterPage = lazy(() => import('./pages/settings/PrinterPage').then((m) => ({ default: m.PrinterPage })));
const PrintQueuePage = lazy(() => import('./pages/settings/PrintQueuePage').then((m) => ({ default: m.PrintQueuePage })));
const SyncPage = lazy(() => import('./pages/settings/SyncPage').then((m) => ({ default: m.SyncPage })));
const StockPage = lazy(() => import('./pages/stock/StockPage').then((m) => ({ default: m.StockPage })));

const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes'));

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <Spinner className="size-10" />
    </div>
  );
}

function Guard({ perm, tabletOnly, children }: { perm?: Permission; tabletOnly?: boolean; children: ReactNode }) {
  const user = useApp((s) => s.user);
  const mode = useApp((s) => s.mode);
  if (!user) return <Navigate to="/login" replace />;
  if (tabletOnly && mode !== 'tablet') return <Navigate to="/" replace />;
  if (perm && !can(user.role, perm)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  const user = useApp((s) => s.user);
  const mode = useApp((s) => s.mode);
  if (!user) return <Navigate to="/login" replace />;
  if (mode === 'tablet' && can(user.role, 'pos.sell')) return <Navigate to="/kasir" replace />;
  if (can(user.role, 'admin')) return <Navigate to="/admin" replace />;
  if (can(user.role, 'stock.opname')) return <Navigate to="/stok" replace />;
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <p className="text-lg font-bold">Akun kasir hanya bisa dipakai di tablet kasir.</p>
        <p className="mt-1 text-fg-muted">Aktifkan perangkat ini sebagai tablet kasir (butuh PIN owner), lalu pilih nama kasir.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button
            onClick={() => {
              // Muat ulang langsung ke /aktivasi: navigasi router berprioritas rendah kalah cepat dengan
              // pengalihan ke /login yang dipicu logout.
              logout();
              window.location.replace('/aktivasi');
            }}
          >
            Aktifkan tablet ini
          </Button>
          <Button
            variant="outline"
            onClick={() => logout()}
          >
            Keluar
          </Button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const ready = useApp((s) => s.ready);
  const { pathname } = useLocation();
  // Kasir keeps its existing palette and layout; only TabletShell's header is redesigned.
  const cashier = /^\/kasir\/?$/i.test(pathname);
  if (!ready) return <Splash />;
  return (
    <ErrorBoundary>
      <div className={cashier ? 'h-full' : 'workspace-theme h-full'}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/aktivasi" element={<ActivatePage />} />
        <Route
          element={
            <Guard tabletOnly>
              <TabletShell />
            </Guard>
          }
        >
          <Route path="/kasir" element={<Guard perm="pos.sell"><PosPage /></Guard>} />
          <Route path="/riwayat" element={<Guard perm="pos.sell"><HistoryPage /></Guard>} />
          <Route path="/meja" element={<Guard perm="pos.sell"><TablesPage /></Guard>} />
          <Route path="/shift" element={<Guard perm="pos.shift"><ShiftPage /></Guard>} />
          <Route path="/hari" element={<Guard perm="pos.shift"><BusinessDayPage /></Guard>} />
          <Route path="/printer" element={<PrinterPage />} />
          <Route path="/antrean-cetak" element={<PrintQueuePage />} />
          <Route path="/sinkron" element={<SyncPage />} />
        </Route>
        <Route path="/stok/*" element={<Guard perm="stock.opname"><Suspense fallback={<Splash />}><StockPage /></Suspense></Guard>} />
        <Route
          path="/admin/*"
          element={
            <Guard perm="admin">
              <Suspense fallback={<Splash />}>
                <AdminRoutes />
              </Suspense>
            </Guard>
          }
        />
        <Route path="*" element={<Home />} />
      </Routes>
      <Toaster />
      <ConfirmHost />
      <UpdatePrompt />
      </div>
    </ErrorBoundary>
  );
}
