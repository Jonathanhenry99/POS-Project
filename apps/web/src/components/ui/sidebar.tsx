import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState, type ComponentProps, type PointerEvent } from 'react';
import { cx } from '../ui';

/** Adaptasi sidebar referensi untuk React Router dan layar sentuh, tanpa dependensi animasi. */
export function useSidebarPreference(key: string, defaultCollapsed = false) {
  const [collapsed, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return saved === 'true';
    } catch { /* Pilihan tetap tersedia selama sesi jika storage dibatasi. */ }
    return defaultCollapsed;
  });
  // Mouse/trackpad: perilaku seperti referensi (hover buka, keluar tutup).
  // Status hover bersifat sementara; pilihan tombol untuk sentuhan tetap tersimpan.
  const [hoverCollapsed, setHoverCollapsed] = useState<boolean | null>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ? true : null,
  );
  const setCollapsed = (value: boolean) => {
    setState(value);
    setHoverCollapsed((current) => current === null ? null : value);
    try { localStorage.setItem(key, String(value)); } catch { /* abaikan */ }
  };
  const hoverEvents = {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') setHoverCollapsed(false);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') setHoverCollapsed(true);
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') setHoverCollapsed(null);
    },
  };
  return [hoverCollapsed ?? collapsed, setCollapsed, hoverEvents] as const;
}

export function Sidebar({ collapsed = false, className, ...props }: ComponentProps<'aside'> & { collapsed?: boolean }) {
  return <aside {...props} data-collapsed={collapsed} className={cx('mourden-sidebar h-full shrink-0 flex-col', className)} />;
}

export function SidebarToggle({ collapsed, onToggle, controls }: { collapsed: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" onClick={onToggle} aria-controls={controls} aria-expanded={!collapsed} aria-label={collapsed ? 'Perluas menu kiri' : 'Perkecil menu kiri'} title={collapsed ? 'Perluas menu' : 'Perkecil menu'} className="sidebar-link w-full">
      {collapsed ? <PanelLeftOpen className="size-5 shrink-0" /> : <PanelLeftClose className="size-5 shrink-0" />}
      {!collapsed && <span>Perkecil menu</span>}
    </button>
  );
}

export function SidebarProfile({ name, role, collapsed = false }: { name: string; role: string; collapsed?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <div className="sidebar-profile" title={`${name} · ${role}`} aria-label={`${name} · ${role}`}>
      <span aria-hidden="true" className="sidebar-avatar">{initials}</span>
      {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p><p className="truncate text-xs text-neutral-500">{role}</p></div>}
    </div>
  );
}
