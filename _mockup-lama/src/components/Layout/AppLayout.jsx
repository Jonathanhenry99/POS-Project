import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAppContext } from '../../context/AppContext';
import { Menu } from 'lucide-react';

function AppLayout() {
  const { currentUser, hasPermission } = useAppContext();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close sidebar on route change on mobile
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // If not logged in, redirect to login page
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Fullscreen routes (no padding, hidden overflow)
  const fullscreenRoutes = ['/pos'];
  const isFullscreen = fullscreenRoutes.includes(location.pathname);

  // Route-based permission check
  const routePermissions = {
    '/dashboard': 'dashboard',
    '/pos': 'pos',
    '/menu': 'menu',
    '/recipes': 'recipe',
    '/inventory': 'inventory',
    '/stock-opname': 'stockOpname',
    '/reports': 'reports',
    '/sales-history': 'salesHistory',
    '/manage-shift': 'shiftManagement',
    '/printer-settings': 'printerSettings',
  };

  const requiredPermission = routePermissions[location.pathname];
  if (requiredPermission && !hasPermission(requiredPermission)) {
    const defaultPath = currentUser.role === 'owner' ? '/dashboard' : '/pos';
    return <Navigate to={defaultPath} replace />;
  }

  return (
    <div className="app-layout">
      {/* Mobile Fixed Header */}
      {!isFullscreen && (
        <div className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span style={{ fontSize: '1.2rem' }}>☕</span>
               <div>
                 <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: '1', color: 'var(--text-primary)' }}>Mourden POS</div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Owner Dashboard</div>
               </div>
            </div>
            <button onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <Menu size={28} />
            </button>
          </div>
        </div>
      )}
      
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} isPOS={isFullscreen} />
      
      <main className={`main-content ${isFullscreen ? 'main-content-pos' : ''}`}>
        <Outlet context={{ setIsMobileMenuOpen }} />
      </main>
    </div>
  );
}

export default AppLayout;
