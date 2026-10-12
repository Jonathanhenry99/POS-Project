import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
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
  // Niat hover: buka hanya bila kursor berhenti sebentar (lewat sekilas tidak memicu), tutup dengan jeda
  // supaya kursor yang keluar sedikit tidak langsung menutup menu.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (value: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHoverCollapsed((current) => (current === null ? null : value)), ms);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const hoverEvents = {
    // Mode hover: sidebar melebar di atas konten (tidak mendorong halaman). Lihat .mourden-sidebar[data-hover].
    'data-hover': hoverCollapsed !== null ? 'true' : undefined,
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') later(false, HOVER_OPEN_MS);
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') later(true, HOVER_CLOSE_MS);
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        if (timer.current) clearTimeout(timer.current);
        setHoverCollapsed(null);
      }
    },
    // Keyboard: menu ikut terbuka saat fokus masuk, menutup saat fokus keluar.
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target.matches(':focus-visible')) later(false, 0);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) later(true, HOVER_CLOSE_MS);
    },
  };
  return [hoverCollapsed ?? collapsed, setCollapsed, hoverEvents] as const;
}

const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 260;

/**
 * `openWidth` = lebar saat terbuka di mode hover (panel melayang di atas konten).
 * Di mode sentuh, lebar tetap diatur kelas dari pemanggil dan konten ikut bergeser seperti biasa.
 */
export function Sidebar({ collapsed = false, className, children, openWidth = 256, style, ...props }: ComponentProps<'aside'> & { collapsed?: boolean; openWidth?: number }) {
  return (
    <aside {...props} data-collapsed={collapsed} style={{ '--sidebar-open': `${openWidth}px`, ...style } as CSSProperties} className={cx('mourden-sidebar h-full shrink-0', className)}>
      <div className="sidebar-panel">{children}</div>
    </aside>
  );
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
