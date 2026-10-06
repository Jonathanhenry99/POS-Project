import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { can, type Permission } from '@mourden/shared';
import { ConfirmHost, Toaster } from './components/feedback';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Spinner } from './components/ui';
import { useApp } from './lib/state';
import { ActivatePage } from './pages/Activate';
import { LoginPage } from './pages/Login';
import { TabletShell } from './pages/TabletShell';

// Halaman kasir dimuat langsung (harus cepat & tersedia offline); admin dimuat saat dibuka.
import { PosPage } from './pages/pos/PosPage';
import { HistoryPage } from './pages/pos/HistoryPage';
import { ShiftPage } from './pages/pos/ShiftPage';
import { PrinterPage } from './pages/settings/PrinterPage';
import { SyncPage } from './pages/settings/SyncPage';
import { StockPage } from './pages/stock/StockPage';

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
        <p className="mt-1 text-stone-600">Login di tablet yang sudah diaktifkan owner.</p>
      </div>
    </div>
  );
}

export function App() {
  const ready = useApp((s) => s.ready);
  if (!ready) return <Splash />;
  return (
    <>
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
          <Route path="/shift" element={<Guard perm="pos.shift"><ShiftPage /></Guard>} />
          <Route path="/printer" element={<PrinterPage />} />
          <Route path="/sinkron" element={<SyncPage />} />
        </Route>
        <Route path="/stok/*" element={<Guard perm="stock.opname"><StockPage /></Guard>} />
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
    </>
  );
}
