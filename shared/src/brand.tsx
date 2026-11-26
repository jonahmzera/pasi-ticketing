import { Link } from 'react-router';

export function Logo({ suffix, to = '/' }: { suffix?: string; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="Pasi home">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-brand-strong text-lg font-black text-on-brand shadow-[var(--shadow-glow)]">P</span>
      <span className="text-xl font-extrabold tracking-tight">pasi</span>
      {suffix && <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted">{suffix}</span>}
    </Link>
  );
}

/** The company behind Pasi. */
export const COMPANY = 'JMCreations';

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`mt-16 flex flex-col items-center gap-1 border-t border-white/5 pt-6 text-center text-xs text-muted ${className}`}>
      <span><span className="font-semibold text-fg">Pasi</span> by <span className="font-display italic text-brand-soft">{COMPANY}</span></span>
      <span>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</span>
    </footer>
  );
}
