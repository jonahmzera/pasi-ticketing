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
