import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { BadgeCheck, Church, Disc3, Drama, Flame, Handshake, MapPin, Mic2, Music, Palette, Tent, Ticket, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { EventCard as EventCardT } from './types';
import { cn, fmtDay, fmtMon, fmtTime, ksh, relDay, themeGradient } from './utils';
import { Badge } from './ui';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Party: Disc3, Music, Food: UtensilsCrossed, Comedy: Mic2, Networking: Handshake, Festival: Tent, Sports: Trophy, Art: Palette, Theatre: Drama, Church,
};
export const CategoryIcon = ({ category, className }: { category?: string; className?: string }) => {
  const I = CATEGORY_ICONS[category || ''] ?? Ticket;
  return <I className={className} aria-hidden />;
};

/** Event artwork: the organizer's poster, or a generated gradient with the category mark. */
export function Poster({ ev, className, children, rounded = true }: {
  ev: { posterUrl?: string; theme?: string; category?: string; title?: string }; className?: string; children?: React.ReactNode; rounded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = ev.posterUrl && !failed;
  return (
    <div className={cn('grain relative overflow-hidden bg-surface-3', rounded && 'rounded-2xl', className)} style={{ backgroundImage: themeGradient(ev.theme) }}>
      {showImg ? (
        <img src={ev.posterUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <CategoryIcon category={ev.category} className="size-[38%] max-h-28 text-white/85 drop-shadow-[0_10px_30px_rgba(0,0,0,.35)]" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      {children}
    </div>
  );
}

export function DatePill({ date, className }: { date: string; className?: string }) {
  return (
    <div className={cn('glass flex flex-col items-center rounded-xl px-2.5 py-1.5 leading-none', className)}>
      <span className="text-lg font-extrabold">{fmtDay(date)}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{fmtMon(date)}</span>
    </div>
  );
}

export function EventCard({ e, index = 0 }: { e: EventCardT; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}>
      <Link to={`/e/${e.slug}`} className="group block rounded-3xl border border-line bg-surface p-2 transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-card)]">
        <Poster ev={e} className="aspect-[4/3]">
          <DatePill date={e.startsAt} className="absolute left-3 top-3" />
          <div className="absolute right-3 top-3 flex gap-1.5">
            {e.soldOut ? <Badge tone="danger">Sold out</Badge> : e.sellingFast ? <Badge tone="hot"><Flame className="size-3" />Selling fast</Badge> : null}
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between">
            <Badge className="bg-black/50 backdrop-blur"><CategoryIcon category={e.category} className="size-3" />{e.category}</Badge>
          </div>
        </Poster>
        <div className="px-2 pb-2 pt-3.5">
          <div className="text-xs font-medium text-brand-soft">{relDay(e.startsAt)} · {fmtTime(e.startsAt)}</div>
          <h3 className="mt-1 line-clamp-1 text-[17px] font-semibold tracking-tight">{e.title}</h3>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{e.venueName}</span></div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
              <span className="truncate">{e.org?.name}</span>{e.org?.verified && <BadgeCheck className="size-3.5 shrink-0 text-info" aria-label="Verified organizer" />}
            </span>
            <span className="text-sm font-bold">{e.minPrice == null ? '—' : e.minPrice === 0 ? 'Free' : <><span className="font-normal text-muted">from </span>{ksh(e.minPrice)}</>}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function EventRow({ e, right }: { e: { slug: string; title: string; startsAt: string; venueName?: string; posterUrl?: string; theme?: string; category?: string }; right?: React.ReactNode }) {
  return (
    <Link to={`/e/${e.slug}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 transition hover:border-line-strong">
      <Poster ev={e} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{e.title}</div>
        <div className="truncate text-sm text-muted">{relDay(e.startsAt)} · {fmtTime(e.startsAt)}{e.venueName ? ` · ${e.venueName}` : ''}</div>
      </div>
      {right}
    </Link>
  );
}
