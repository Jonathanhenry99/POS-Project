import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  BookOpen,
  Package,
  ClipboardCheck,
  LogOut,
  Coffee,
  FileText,
  History,
  Clock,
  Printer,
  X
} from 'lucide-react';

function Sidebar({ isOpen, onClose, isPOS }) {
  const { currentUser, logout, hasPermission } = useAppContext();
  const location = useLocation();
  const [clock, setClock] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard', section: 'Overview' },
    { path: '/pos', icon: ShoppingCart, label: 'Point of Sale', permission: 'pos', section: 'Operations' },
    { path: '/sales-history', icon: History, label: 'Riwayat Penjualan', permission: 'salesHistory', section: null },
    { path: '/manage-shift', icon: Clock, label: 'Kelola Shift', permission: 'shiftManagement', section: null },
    { path: '/menu', icon: UtensilsCrossed, label: 'Menu Management', permission: 'menu', section: 'Management' },
    { path: '/recipes', icon: BookOpen, label: 'Recipes', permission: 'recipe', section: null },
    { path: '/inventory', icon: Package, label: 'Inventory', permission: 'inventory', section: 'Stock' },
    { path: '/stock-opname', icon: ClipboardCheck, label: 'Stock Opname', permission: 'stockOpname', section: null },
    { path: '/reports', icon: FileText, label: 'Laporan Penjualan', permission: 'reports', section: 'Reports' },
    { path: '/printer-settings', icon: Printer, label: 'Koneksi Printer', permission: 'printerSettings', section: 'Settings' },
  ];

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  let lastSection = null;

  return (
    <aside className={`sidebar ${isPOS ? 'pos-drawer' : ''} ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand" style={{ position: 'relative' }}>
        <div className="sidebar-brand-logo">
          <div className="sidebar-brand-icon">M</div>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">MOURDEN</div>
            <div className="sidebar-brand-subtitle">Cafe & Eatery</div>
          </div>
        </div>
        <button 
          className="mobile-close-btn" 
          onClick={onClose}
          style={{ position: 'absolute', right: '15px', top: '20px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          if (!hasPermission(item.permission)) return null;

          const showSection = item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;

          return (
            <React.Fragment key={item.path}>
              {showSection && (
                <div className="sidebar-nav-section">{item.section}</div>
              )}
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `sidebar-nav-link ${isActive ? 'active' : ''}`
                }
              >
                <item.icon />
                <span>{item.label}</span>
              </NavLink>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-clock">
          <div>{formatTime(clock)}</div>
          <div>{formatDate(clock)}</div>
        </div>
        {currentUser && (
          <div className="sidebar-user" onClick={logout} title="Click to logout">
            <div className="sidebar-user-avatar">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{currentUser.name}</div>
              <div className="sidebar-user-role">{currentUser.role}</div>
            </div>
            <LogOut size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
