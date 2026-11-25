import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Drawer } from 'vaul';
import { Loader2, X } from 'lucide-react';
import { cn, initials } from './utils';

// ---------- Button ----------
const variants = {
  primary: 'bg-brand text-on-brand hover:bg-brand-soft shadow-[var(--shadow-glow)] font-semibold',
  secondary: 'bg-surface-3 text-fg hover:bg-line-strong border border-line',
  outline: 'border border-line-strong text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'text-danger hover:bg-danger/10 border border-danger/30',
  light: 'bg-fg text-bg hover:bg-white font-semibold',
} as const;
const sizes = { sm: 'h-9 px-3 text-sm rounded-xl gap-1.5', md: 'h-11 px-4 text-[15px] rounded-xl gap-2', lg: 'h-14 px-6 text-base rounded-2xl gap-2.5', icon: 'h-11 w-11 rounded-xl' } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants; size?: keyof typeof sizes; loading?: boolean; block?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, block, className, children, disabled, ...p }, ref,
) {
  return (
    <button ref={ref} disabled={disabled || loading}
      className={cn('inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-45',
        variants[variant], sizes[size], block && 'w-full', className)} {...p}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------- Form fields ----------
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn('h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-[15px] text-fg placeholder:text-subtle outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn('w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[15px] text-fg placeholder:text-subtle outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15', className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn('h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-fg outline-none focus:border-brand focus:ring-4 focus:ring-brand/15', className)} {...p} />;
});
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

// ---------- Badge ----------
const tones = {
  neutral: 'bg-white/8 text-fg border-white/10', brand: 'bg-brand/15 text-brand-soft border-brand/25', hot: 'bg-hot/15 text-hot border-hot/25',
  warn: 'bg-warn/15 text-warn border-warn/25', danger: 'bg-danger/15 text-danger border-danger/25', info: 'bg-info/15 text-info border-info/25', glow: 'bg-glow/15 text-glow border-glow/25',
} as const;
export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none', tones[tone], className)}>{children}</span>;
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton', className)} />;

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  const hue = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-bg', className)}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 70% 35%))` }}>
      {initials(name)}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl border border-line bg-surface-2 text-muted [&_svg]:size-7">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all',
            value === o.value ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Sheet: bottom drawer on phones, centered dialog feel on desktop ----------
export function Sheet({ open, onOpenChange, title, description, children, dismissible = true }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children: ReactNode; dismissible?: boolean;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} dismissible={dismissible} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-surface outline-none sm:bottom-6 sm:rounded-3xl">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line-strong sm:hidden" />
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <Drawer.Title className="text-xl font-bold tracking-tight">{title}</Drawer.Title>
              {description ? <Drawer.Description className="mt-1 text-sm text-muted">{description}</Drawer.Description> : <Drawer.Description className="sr-only">{title}</Drawer.Description>}
            </div>
            {dismissible && (
              <button onClick={() => onOpenChange(false)} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted transition hover:text-fg">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn('mt-2 whitespace-nowrap text-xl font-bold tracking-tight tabular-nums xl:text-2xl', accent && 'text-brand-soft')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-strong to-brand-soft transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
