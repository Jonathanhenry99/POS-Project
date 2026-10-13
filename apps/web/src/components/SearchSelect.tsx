import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx, inputClass } from './ui';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Keterangan kecil di kanan (satuan, kategori). Ikut dicari. */
  hint?: string;
  /** Judul kelompok; pilihan dengan kelompok sama dikumpulkan di bawah satu judul. */
  group?: string;
  /** Terlihat tetapi tidak bisa dipilih (mis. meja yang sedang terisi). */
  disabled?: boolean;
}

interface Place {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const PHONE = 640;
/** Daftar pendek tidak butuh kotak cari. */
const SEARCH_FROM = 6;

/**
 * Pengganti <select> bawaan: daftar pilihan yang bisa dicari dengan mengetik.
 * Di laptop/tablet daftarnya menempel di bawah tombol; di HP tampil di bagian atas layar supaya tidak tertutup keyboard.
 */
export function SearchSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  label,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Ketik untuk mencari...',
  search,
  disabled,
  autoOpen,
  className,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Nama bidang untuk pembaca layar dan judul daftar di HP. */
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Paksa kotak cari tampil/sembunyi. Bawaan: tampil bila pilihan banyak. */
  search?: boolean;
  disabled?: boolean;
  /** Langsung buka daftar saat muncul (baris baru yang belum dipilih). */
  autoOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const typed = useRef('');
  const typedAt = useRef(0);
  const selected = options.find((o) => o.value === value);
  const withSearch = search ?? options.length >= SEARCH_FROM;

  const shown = useMemo(() => {
    const words = query.toLocaleLowerCase('id-ID').split(/\s+/).filter(Boolean);
    const hit = options.filter((o) => {
      const text = `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLocaleLowerCase('id-ID');
      return words.every((w) => text.includes(w));
    });
    // Kelompok dikumpulkan tanpa mengubah urutan kemunculan pertamanya.
    const order = [...new Set(hit.map((o) => o.group ?? ''))];
    return hit.slice().sort((a, b) => order.indexOf(a.group ?? '') - order.indexOf(b.group ?? ''));
  }, [options, query]);

  const close = (focus = true) => {
    setOpen(false);
    setQuery('');
    if (focus) button.current?.focus();
  };
  const pick = (o: SelectOption<T>) => {
    if (o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  const openList = () => {
    if (disabled) return;
    // Tetap di dalam pembungkus tema supaya warna mengikuti halaman (admin atau kasir).
    setHost(button.current?.closest('.workspace-theme') ?? document.body);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  useEffect(() => {
    if (autoOpen) openList();
  }, []);

  // Posisi daftar mengikuti tombol; dihitung ulang saat halaman digulir atau ukuran layar/keyboard berubah.
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const view = window.visualViewport;
      const height = view?.height ?? window.innerHeight;
      if (window.innerWidth < PHONE) return setPlace({ left: 12, width: window.innerWidth - 24, top: (view?.offsetTop ?? 0) + 12, maxHeight: height - 24 });
      const r = button.current!.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
      const below = height - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 280 && above > below;
      setPlace({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        width,
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        maxHeight: Math.max(160, Math.min(400, up ? above : below)),
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    window.visualViewport?.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      window.visualViewport?.removeEventListener('resize', compute);
    };
  }, [open]);

  // Daftar baru ada di layar setelah posisinya dihitung; fokus dipindah saat itu supaya bisa langsung mengetik.
  const ready = open && !!place && !!host;
  useEffect(() => {
    if (ready) (withSearch ? input.current : panel.current)?.focus();
  }, [ready, withSearch]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Element;
      // Latar gelap di HP ditutup lewat klik (bukan pointerdown) supaya ketukan tidak tembus ke tombol di bawahnya.
      if (t.closest?.('[data-select-backdrop]')) return;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  useEffect(() => {
    if (open) panel.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active, place]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === 'Escape') {
      // Jangan sampai ikut menutup jendela (modal) di belakangnya.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Daftar pendek tanpa kotak cari: mengetik melompat ke pilihan yang berawalan huruf itu (seperti dropdown bawaan).
      typed.current = Date.now() - typedAt.current > 700 ? e.key : typed.current + e.key;
      typedAt.current = Date.now();
      const i = shown.findIndex((o) => !o.disabled && o.label.toLocaleLowerCase('id-ID').startsWith(typed.current.toLocaleLowerCase('id-ID')));
      if (i >= 0) setActive(i);
    }
  };

  const phone = !!place && typeof window !== 'undefined' && window.innerWidth < PHONE;
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
        className={cx(inputClass, 'flex items-center justify-between gap-2 text-left', open && 'border-primary ring-4 ring-primary/15', className)}
      >
        <span className={cx('min-w-0 truncate', !selected && 'text-fg-subtle')}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        place &&
        host &&
        createPortal(
          <>
            {phone && <div data-select-backdrop className="fixed inset-0 z-50 bg-black/40" onClick={() => close(false)} />}
            <div
              ref={panel}
              tabIndex={-1}
              onKeyDown={onKey}
              style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
              className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-[0_18px_50px_-12px_rgb(0_0_0/0.35)] outline-none"
            >
              {phone && label && <p className="px-4 pt-3 text-sm font-semibold text-fg-muted">{label}</p>}
              {withSearch && (
                <div className="relative border-b border-line p-2">
                  <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-fg-subtle" />
                  <input
                    ref={input}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    placeholder={searchPlaceholder}
                    aria-label={label ? `Cari ${label}` : 'Cari pilihan'}
                    aria-controls={listId}
                    autoComplete="off"
                    autoCapitalize="none"
                    className="h-11 w-full rounded-xl bg-surface-2 pr-3 pl-10 text-base outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}
              <ul id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                {shown.map((o, i) => (
                  <li key={o.value} role="presentation">
                    {o.group && o.group !== shown[i - 1]?.group && <p className="px-3 pt-2 pb-1 text-xs font-bold tracking-wide text-fg-subtle uppercase">{o.group}</p>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled}
                      data-active={i === active}
                      tabIndex={-1}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick(o)}
                      className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left', i === active && !o.disabled && 'bg-surface-2', o.value === value && 'font-semibold', o.disabled && 'cursor-not-allowed text-fg-subtle')}
                    >
                      <span className="min-w-0 flex-1">{o.label}</span>
                      {o.hint && <span className="shrink-0 text-sm font-normal text-fg-muted">{o.hint}</span>}
                      <Check className={cx('size-4 shrink-0 text-primary', o.value !== value && 'invisible')} />
                    </button>
                  </li>
                ))}
                {!shown.length && <li className="px-3 py-6 text-center text-sm text-fg-muted">Tidak ada yang cocok dengan “{query.trim()}”.</li>}
              </ul>
            </div>
          </>,
          host,
        )}
    </>
  );
}
