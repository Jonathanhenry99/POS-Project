import { Delete, Loader2, X } from 'lucide-react';
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { formatNumber, parseRupiah } from '@mourden/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'success' | 'danger' | 'outline' | 'ghost' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 active:bg-brand-700 disabled:bg-stone-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-stone-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-stone-300',
  warning: 'bg-amber-500 text-stone-950 hover:bg-amber-600 disabled:bg-stone-300',
  outline: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 active:bg-stone-100 disabled:text-stone-400',
  ghost: 'bg-transparent text-stone-700 hover:bg-stone-200/70 active:bg-stone-200 disabled:text-stone-400',
};

const SIZE: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-12 px-4 text-base gap-2 rounded-xl',
  lg: 'h-14 px-5 text-lg gap-2 rounded-xl',
  xl: 'h-16 px-6 text-xl gap-3 rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-6 animate-spin text-stone-400', className)} />;
}

export function Badge({ tone = 'stone', children }: { tone?: 'stone' | 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  const tones = {
    stone: 'bg-stone-200 text-stone-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-900',
    blue: 'bg-sky-100 text-sky-800',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/50 sm:items-center sm:p-4"
      onPointerDown={(e) => dismissable && e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" className={cx('flex max-h-[94dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', widths[size])}>
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
            <h2 className="text-lg font-bold">{title}</h2>
            {dismissable && (
              <button aria-label="Tutup" onClick={onClose} className="-mr-2 grid size-11 place-items-center rounded-full text-stone-500 hover:bg-stone-100">
                <X className="size-6" />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-3 border-t border-stone-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Numpad besar untuk input nominal/jumlah. */
export function NumPad({ onKey, extra = '000' }: { onKey: (key: string) => void; extra?: string | null }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', extra ?? '', '0', 'del'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k === '' ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            onClick={() => onKey(k)}
            aria-label={k === 'del' ? 'Hapus' : k}
            className="grid h-14 place-items-center rounded-xl bg-stone-100 text-2xl font-semibold text-stone-800 active:bg-stone-300"
          >
            {k === 'del' ? <Delete className="size-6" /> : k}
          </button>
        ),
      )}
    </div>
  );
}

export function applyNumKey(current: string, key: string, maxLen = 10): string {
  if (key === 'del') return current.slice(0, -1);
  const next = (current === '0' ? '' : current) + key;
  return next.replace(/^0+(?=\d)/, '').slice(0, maxLen);
}

/** Input PIN: titik + numpad. */
export function PinPad({
  onSubmit,
  busy,
  error,
  submitLabel = 'Masuk',
}: {
  onSubmit: (pin: string) => void | Promise<void>;
  busy?: boolean;
  error?: string;
  submitLabel?: string;
}) {
  const [pin, setPin] = useState('');
  useEffect(() => {
    if (error) setPin('');
  }, [error]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p + e.key).slice(0, 6));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= 4) void onSubmit(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin, onSubmit]);
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-2 flex h-8 items-center justify-center gap-3" aria-label={`${pin.length} digit`}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={cx('size-4 rounded-full border-2', i < pin.length ? 'border-brand-900 bg-brand-900' : 'border-stone-300', i >= 4 && i >= pin.length && 'opacity-40')} />
        ))}
      </div>
      <p className="mb-3 h-5 text-center text-sm font-medium text-red-600">{error}</p>
      <NumPad extra={null} onKey={(k) => setPin((p) => (k === 'del' ? p.slice(0, -1) : (p + k).slice(0, 6)))} />
      <Button className="mt-3 w-full" size="lg" disabled={pin.length < 4} loading={busy} onClick={() => onSubmit(pin)}>
        {submitLabel}
      </Button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-stone-700">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-200 disabled:bg-stone-100';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

/** Input rupiah dengan pemisah ribuan otomatis. */
export function MoneyInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500">Rp</span>
      <input
        {...rest}
        inputMode="numeric"
        value={value ? formatNumber(value) : ''}
        onChange={(e) => onChange(parseRupiah(e.target.value))}
        className={cx(inputClass, 'pl-10 text-right tabular')}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl py-2 text-left"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {description && <span className="block text-sm text-stone-500">{description}</span>}
      </span>
      <span className={cx('relative h-8 w-14 shrink-0 rounded-full transition-colors', checked ? 'bg-emerald-600' : 'bg-stone-300')}>
        <span className={cx('absolute top-1 size-6 rounded-full bg-white shadow transition-all', checked ? 'left-7' : 'left-1')} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-xl bg-stone-200 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-11 flex-1 rounded-lg px-3 text-sm font-semibold', value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-stone-200 bg-white', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <h3 className="font-bold text-stone-800">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-stone-500">
      {icon}
      <p className="font-semibold text-stone-700">{title}</p>
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{children}</p>;
}
