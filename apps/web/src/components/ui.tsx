import { Delete, Loader2, X } from 'lucide-react';
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { formatNumber, parseRupiah } from '@mourden/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'success' | 'danger' | 'outline' | 'ghost' | 'warning' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-grad-primary text-white glow hover:brightness-110 disabled:bg-none disabled:bg-surface-3 disabled:text-fg-subtle disabled:shadow-none',
  success:
    'bg-grad-success text-white shadow-[0_10px_30px_-10px_rgb(16_185_129/0.7)] hover:brightness-110 disabled:bg-none disabled:bg-surface-3 disabled:text-fg-subtle disabled:shadow-none',
  danger: 'bg-grad-danger text-white hover:brightness-110 disabled:bg-none disabled:bg-surface-3 disabled:text-fg-subtle',
  warning: 'bg-warning text-on-warning hover:brightness-110 disabled:bg-surface-3 disabled:text-fg-subtle',
  outline: 'border border-line-strong bg-surface text-fg hover:border-primary/60 hover:bg-surface-2 disabled:text-fg-subtle',
  soft: 'bg-primary/12 text-primary hover:bg-primary/20 disabled:text-fg-subtle',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg disabled:text-fg-subtle',
};

const SIZE: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm gap-1.5 rounded-xl',
  md: 'h-12 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-14 px-5 text-base gap-2 rounded-2xl',
  xl: 'h-16 px-6 text-lg gap-3 rounded-2xl',
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
        'press inline-flex shrink-0 items-center justify-center font-semibold tracking-tight disabled:cursor-not-allowed',
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
  return <Loader2 className={cx('size-6 animate-spin text-primary', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

type Tone = 'stone' | 'green' | 'red' | 'amber' | 'blue' | 'violet';
const TONES: Record<Tone, string> = {
  stone: 'bg-surface-3 text-fg-muted',
  green: 'bg-success/15 text-success',
  red: 'bg-danger/15 text-danger',
  amber: 'bg-warning/15 text-warning',
  blue: 'bg-accent/15 text-accent',
  violet: 'bg-primary/15 text-primary',
};

export function Badge({ tone = 'stone', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>{children}</span>;
}

/** Titik status dengan denyut halus (online, sinkron, printer). */
export function StatusDot({ tone, pulse }: { tone: 'green' | 'amber' | 'red' | 'blue'; pulse?: boolean }) {
  const color = { green: 'bg-success', amber: 'bg-warning', red: 'bg-danger', blue: 'bg-accent' }[tone];
  return (
    <span className="relative inline-flex size-2.5">
      {pulse && <span className={cx('absolute inset-0 rounded-full animate-ping-soft', color)} />}
      <span className={cx('relative size-2.5 rounded-full', color)} />
    </span>
  );
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
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };
  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onPointerDown={(e) => dismissable && e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'animate-sheet sm:animate-rise flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-card sm:rounded-3xl',
          widths[size],
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            {dismissable && (
              <button aria-label="Tutup" onClick={onClose} className="press -mr-2 grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
                <X className="size-5" />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-3 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
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
            className={cx(
              'press grid h-14 place-items-center rounded-2xl border border-line text-2xl font-semibold tabular active:bg-primary/20',
              k === 'del' ? 'bg-surface-3 text-fg-muted' : 'bg-surface-2 text-fg hover:border-line-strong',
            )}
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
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (error) {
      setPin('');
      setShake((n) => n + 1);
    }
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
      <div key={shake} className={cx('mb-2 flex h-8 items-center justify-center gap-3', shake > 0 && 'animate-rise')} aria-label={`${pin.length} digit`}>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cx(
              'size-3.5 rounded-full border-2 transition-all duration-150',
              i < pin.length ? 'scale-110 border-primary bg-primary shadow-[0_0_12px_var(--primary)]' : 'border-line-strong',
              i >= 4 && i >= pin.length && 'opacity-40',
            )}
          />
        ))}
      </div>
      <p className="mb-3 h-5 text-center text-sm font-medium text-danger">{error}</p>
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
      <label htmlFor={id} className="text-sm font-semibold text-fg-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-fg placeholder:text-fg-subtle outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

/** Input rupiah dengan pemisah ribuan otomatis. */
export function MoneyInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-fg-subtle">Rp</span>
      <input
        {...rest}
        inputMode="numeric"
        value={value ? formatNumber(value) : ''}
        onChange={(e) => onChange(parseRupiah(e.target.value))}
        className={cx(inputClass, 'pl-10 text-right font-semibold tabular')}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl py-2 text-left">
      <span>
        <span className="block font-semibold">{label}</span>
        {description && <span className="block text-sm text-fg-muted">{description}</span>}
      </span>
      <span className={cx('relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-grad-success' : 'bg-surface-3')}>
        <span className={cx('absolute top-1 size-6 rounded-full bg-white shadow transition-all duration-200', checked ? 'left-7' : 'left-1')} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-2xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'press h-11 flex-1 rounded-xl px-3 text-sm font-semibold',
            value === o.value ? 'bg-surface text-fg shadow-card ring-1 ring-primary/40' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, action, children, className, icon }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={cx('animate-rise rounded-3xl border border-line bg-surface shadow-card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
          <h3 className="flex items-center gap-2 font-bold tracking-tight">
            {icon && <span className="grid size-8 place-items-center rounded-xl bg-primary/12 text-primary">{icon}</span>}
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className="p-5 pt-3">{children}</div>
    </section>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-fg-muted">
      {icon && <div className="mb-1 grid size-16 place-items-center rounded-3xl border border-line bg-surface-2 text-fg-subtle">{icon}</div>}
      <p className="font-semibold text-fg">{title}</p>
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="animate-fade-in rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{children}</p>;
}
