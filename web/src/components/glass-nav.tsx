// Liquid-glass tab bar with a "limelight": a beam of light that shines down on the active tab
// and slides to whichever tab you hover or press.
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@shared/utils';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

export function GlassNav({ items, className, compact }: { items: NavItem[]; className?: string; compact?: boolean }) {
  const loc = useLocation();
  const reduce = useReducedMotion();
  const active = Math.max(0, items.findIndex((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to))));
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? active;
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 26, mass: 0.9 };
  const pct = ((lit + 0.5) / items.length) * 100;

  return (
    <nav aria-label="Main" onPointerLeave={() => setHover(null)}
      className={cn(
        'relative isolate grid overflow-hidden rounded-full border border-white/15 bg-white/[.06] p-1.5',
        'shadow-[inset_0_1px_0_rgba(255,255,255,.22),inset_0_-1px_0_rgba(255,255,255,.04),0_20px_50px_-12px_rgba(0,0,0,.75)]',
        'backdrop-blur-2xl backdrop-saturate-150', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {/* limelight: lamp + light cone */}
      <motion.div aria-hidden className="pointer-events-none absolute top-0 z-0 h-full w-24 -translate-x-1/2" initial={false} animate={{ left: `${pct}%` }} transition={spring}>
        <div className="mx-auto h-[3px] w-10 rounded-b-full bg-brand-soft shadow-[0_0_14px_3px_rgba(74,222,128,.75)]" />
        <div className="mx-auto h-full w-24 bg-gradient-to-b from-brand-soft/35 to-transparent [clip-path:polygon(30%_0,70%_0,100%_100%,0_100%)]" />
      </motion.div>

      {items.map((n, i) => {
        const isActive = i === active, isLit = i === lit;
        return (
          <NavLink key={n.to} to={n.to} end={n.end} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            aria-current={isActive ? 'page' : undefined}
            className={cn('relative z-10 flex flex-col items-center justify-center gap-1 rounded-full font-medium outline-none transition-colors duration-200',
              compact ? 'h-10 flex-row gap-2 px-4 text-sm' : 'h-14 text-[11px]', isLit ? 'text-fg' : 'text-subtle')}>
            {isActive && (
              <motion.span layoutId={compact ? 'glass-drop-top' : 'glass-drop'} transition={spring}
                className="absolute inset-0 -z-10 rounded-full border border-white/20 bg-white/[.12] shadow-[inset_0_1px_0_rgba(255,255,255,.35),inset_0_-6px_12px_rgba(255,255,255,.04)]" />
            )}
            <n.icon className={cn('size-5 transition-all duration-300', compact && 'size-4', isLit && 'text-brand-soft drop-shadow-[0_0_8px_rgba(74,222,128,.8)]')} />
            <span>{n.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
