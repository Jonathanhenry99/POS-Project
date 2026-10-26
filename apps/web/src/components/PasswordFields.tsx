import { Check, Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';
import { passwordProblem } from '@mourden/shared';
import { cx, inputClass } from './ui';

/** Kolom kata sandi dengan tombol tampil/sembunyi. */
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cx(inputClass, 'pr-12', className)} />
      <button type="button" aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShow((v) => !v)} className="absolute top-1 right-1 grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-surface-2">
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

/** Kata sandi baru + ulangi, dengan daftar syarat yang tercentang saat terpenuhi. */
export function NewPasswordFields({ value, confirm, onChange, onConfirm, username = '' }: { value: string; confirm: string; onChange: (v: string) => void; onConfirm: (v: string) => void; username?: string }) {
  const a = useId();
  const b = useId();
  const rules = [
    { ok: value.length >= 8, text: 'Minimal 8 karakter' },
    { ok: /[A-Za-z]/.test(value) && /\d/.test(value), text: 'Ada huruf dan angka' },
    { ok: !!value && !passwordProblem(value, username), text: 'Tidak mudah ditebak (bukan username atau kata umum)' },
    { ok: !!value && value === confirm, text: 'Kedua kolom sama' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={a} className="text-sm font-semibold text-fg-muted">
          Kata sandi baru
        </label>
        <PasswordInput id={a} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={b} className="text-sm font-semibold text-fg-muted">
          Ulangi kata sandi
        </label>
        <PasswordInput id={b} autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} />
      </div>
      <ul className="flex flex-col gap-1.5 text-sm" aria-label="Syarat kata sandi">
        {rules.map((r) => (
          <li key={r.text} className={cx('flex items-center gap-2 transition-colors', r.ok ? 'text-success' : 'text-fg-muted')}>
            <span className={cx('grid size-5 place-items-center rounded-full transition-all duration-300', r.ok ? 'scale-100 bg-success text-white' : 'scale-90 bg-surface-3 text-transparent')}>
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function passwordReady(value: string, confirm: string, username = ''): boolean {
  return !passwordProblem(value, username) && value === confirm;
}
