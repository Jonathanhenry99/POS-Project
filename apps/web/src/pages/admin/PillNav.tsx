import { Search, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { TextInput, cx } from '../../components/ui';

export interface PillOption<T extends string> {
  value: T;
  label: string;
  /** Jumlah isi bagian/kategori, tampil di samping label. */
  count?: number;
  icon?: ReactNode;
}

/** Baris pil yang bisa digeser: navigasi bagian halaman atau filter kategori. Dipakai seragam di halaman admin. */
export function PillNav<T extends string>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (v: T) => void; options: PillOption<T>[]; className?: string }) {
  // Di HP barisnya digeser: pastikan pil yang aktif selalu terlihat (mis. saat halaman dibuka dari tautan).
  // Hanya baris ini yang digeser mendatar; scrollIntoView ikut menggulir halaman ke bawah, jadi tidak dipakai.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = ref.current;
    const active = row?.querySelector('[aria-pressed="true"]');
    if (!row || !active) return;
    const r = row.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.left < r.left || a.right > r.right) row.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
  }, [value]);
  return (
    <div ref={ref} role="group" aria-label={label} className={cx('no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className="pill shrink-0 bg-surface shadow-card">
          {o.icon}
          {o.label}
          {o.count !== undefined && <span className="rounded-full bg-black/8 px-2 py-0.5 text-xs tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Kotak cari dengan tombol hapus, untuk daftar panjang (menu, bahan, resep). */
export function SearchBox({ value, onChange, label, placeholder, className }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; className?: string }) {
  return (
    <div className={cx('relative min-w-48 flex-1', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3.5 size-5 text-fg-subtle" />
      <TextInput aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="bg-surface px-11" />
      {value && (
        <button type="button" aria-label="Hapus pencarian" onClick={() => onChange('')} className="absolute top-1 right-1 grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-surface-2">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Cocokkan teks tanpa membedakan huruf besar/kecil. */
export function matches(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('id-ID').includes(needle.trim().toLocaleLowerCase('id-ID'));
}
