// Home spotlight: a 3D ring of event posters. Drag/swipe or use the arrows to spin it.
// Whichever poster the ring stops on is shown below in a "poster flow" with its details.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react';
import { ArrowRight, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Flame, MapPin } from 'lucide-react';
import type { EventCard as EventCardT } from '@shared/types';
import { fmtTime, ksh, relDay } from '@shared/utils';
import { CategoryIcon, Poster } from '@shared/event';

const mod = (n: number, m: number) => ((n % m) + m) % m;

function useCardWidth() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 132 : 180));
  useEffect(() => {
    const on = () => setW(window.innerWidth < 640 ? 132 : 180);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function FeaturedRing({ events }: { events: EventCardT[] }) {
  const items = useMemo(() => {
    const base = events.filter((e) => !e.soldOut).slice(0, 10);
    // A ring needs enough posters to close the circle; repeat short lists.
    let list = base;
    while (list.length && list.length < 6) list = [...list, ...base];
    return list.slice(0, 10);
  }, [events]);
  const n = items.length;
  const step = 360 / Math.max(n, 1);
  const cardW = useCardWidth();
  const radius = Math.round((cardW / 2) / Math.tan(Math.PI / Math.max(n, 3)) * 1.18);
  const reduce = useReducedMotion();

  const rot = useMotionValue(0);
  const [sel, setSel] = useState(0);
  const drag = useRef<{ x: number; r: number; moved: boolean; t: number } | null>(null);
  const idleUntil = useRef(0);
  const dragged = useRef(false); // swallow the click that ends a drag

  const snapTo = useCallback((index: number) => {
    // choose the target angle nearest to the current rotation
    const cur = rot.get();
    const target = -index * step;
    const k = Math.round((cur - target) / 360);
    animate(rot, target + k * 360, reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 18 });
  }, [rot, step, reduce]);

  useMotionValueEvent(rot, 'animationComplete', () => setSel(mod(Math.round(-rot.get() / step), n)));

  // auto-spin while nobody is touching it
  useEffect(() => {
    if (reduce || n < 2) return;
    const t = setInterval(() => {
      if (drag.current || Date.now() < idleUntil.current || document.hidden) return;
      snapTo(mod(Math.round(-rot.get() / step), n) + 1);
    }, 4200);
    return () => clearInterval(t);
  }, [n, step, snapTo, reduce, rot]);

  const pause = () => { idleUntil.current = Date.now() + 9000; };
  const go = (d: number) => { pause(); snapTo(mod(Math.round(-rot.get() / step), n) + d); };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    pause();
    rot.stop();
    drag.current = { x: e.clientX, r: rot.get(), moved: false, t: performance.now() };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) { d.moved = true; dragged.current = true; e.currentTarget.setPointerCapture(e.pointerId); }
    if (!d.moved) return;
    rot.set(d.r + dx * 0.35);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; drag.current = null; if (!d) return;
    const dt = Math.max(1, performance.now() - d.t);
    const velocity = ((e.clientX - d.x) * 0.35) / dt; // deg per ms
    const projected = rot.get() + velocity * 220;
    if (!d.moved) return;
    pause();
    snapTo(mod(Math.round(-projected / step), n));
  };

  if (!n) return null;
  return (
    <section aria-label="Featured events" className="mb-12">
      <div className="mb-4 flex items-end justify-between">
        <div><div className="eyebrow">Spotlight</div><h2 className="mt-1 text-2xl font-bold tracking-tight">Spin to explore</h2></div>
        <div className="flex gap-2">
          <button aria-label="Previous event" onClick={() => go(-1)} className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/5 backdrop-blur transition hover:bg-white/10"><ChevronLeft className="size-5" /></button>
          <button aria-label="Next event" onClick={() => go(1)} className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/5 backdrop-blur transition hover:bg-white/10"><ChevronRight className="size-5" /></button>
        </div>
      </div>

      {/* 3D ring */}
      <div className="relative -mx-4 overflow-hidden sm:mx-0" style={{ height: cardW * 1.5 + 70 }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        <div className="absolute inset-0 cursor-grab touch-pan-y select-none active:cursor-grabbing" style={{ perspective: 1100 }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }} tabIndex={0} role="listbox" aria-label="Spin through featured events">
          <motion.div className="absolute left-1/2 top-6" style={{ width: cardW, height: cardW * 1.5, marginLeft: -cardW / 2, transformStyle: 'preserve-3d', rotateY: rot, z: -radius }}>
            {items.map((e, i) => <RingCard key={i} e={e} i={i} step={step} radius={radius} rot={rot} selected={i === sel}
              onPick={() => { pause(); snapTo(i); }} />)}
          </motion.div>
        </div>
      </div>

      <PosterFlow items={items} sel={sel} onPick={(i) => { pause(); snapTo(i); }} />
    </section>
  );
}

function RingCard({ e, i, step, radius, rot, selected, onPick }: {
  e: EventCardT; i: number; step: number; radius: number; rot: ReturnType<typeof useMotionValue<number>>; selected: boolean; onPick: () => void;
}) {
  // fade posters as they turn away from the viewer
  const facing = useTransform(rot, (r) => Math.cos(((r + i * step) * Math.PI) / 180));
  const opacity = useTransform(facing, [-1, 0, 1], [0.15, 0.45, 1]);
  const brightness = useTransform(facing, [-1, 1], [0.35, 1]);
  const filter = useTransform(brightness, (b) => `brightness(${b})`);
  return (
    <motion.button type="button" role="option" aria-selected={selected} aria-label={`${e.title}, ${relDay(e.startsAt)}`}
      onClick={onPick}
      className="absolute inset-0 overflow-hidden rounded-2xl border border-white/15 shadow-[0_20px_40px_-12px_rgba(0,0,0,.8)] [backface-visibility:hidden]"
      style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)`, opacity, filter }}>
      <Poster ev={e} rounded={false} className="size-full">
        <div className="absolute inset-x-0 bottom-0 p-3 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-soft">{relDay(e.startsAt)}</div>
          <div className="line-clamp-2 text-sm font-bold leading-tight">{e.title}</div>
        </div>
      </Poster>
    </motion.button>
  );
}

/** Coverflow of the selected event with its neighbours tilted away on either side. */
function PosterFlow({ items, sel, onPick }: { items: EventCardT[]; sel: number; onPick: (i: number) => void }) {
  const n = items.length;
  const e = items[sel];
  const side = (d: number) => items[mod(sel + d, n)];
  return (
    <div className="relative mt-2 grid items-center gap-4 lg:grid-cols-[1fr_minmax(0,560px)_1fr]" style={{ perspective: 1400 }}>
      {[-1, 1].map((d) => (
        <button key={d} type="button" onClick={() => onPick(mod(sel + d, n))} aria-label={`Show ${side(d).title}`}
          className={`hidden h-64 overflow-hidden rounded-3xl border border-white/10 opacity-50 transition hover:opacity-80 lg:block ${d < 0 ? 'order-first' : 'order-last'}`}
          style={{ transform: `rotateY(${d < 0 ? 28 : -28}deg) scale(.9)` }}>
          <Poster ev={side(d)} rounded={false} className="size-full" />
        </button>
      ))}
      <AnimatePresence mode="wait">
        <motion.div key={e.id + sel} initial={{ opacity: 0, y: 16, rotateX: -8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/[.05] shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_30px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl">
          <div className="grid sm:grid-cols-[200px_1fr]">
            <Poster ev={e} rounded={false} className="aspect-[16/10] sm:aspect-auto sm:h-full" />
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold"><CategoryIcon category={e.category} className="size-3" />{e.category}</span>
                {e.sellingFast && <span className="inline-flex items-center gap-1 rounded-full bg-hot/20 px-2.5 py-1 text-[11px] font-semibold text-hot"><Flame className="size-3" />Selling fast</span>}
              </div>
              <h3 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">{e.title}</h3>
              <div className="mt-3 space-y-1.5 text-sm text-muted">
                <div className="flex items-center gap-2"><CalendarDays className="size-4 text-brand-soft" />{relDay(e.startsAt)} · {fmtTime(e.startsAt)}</div>
                <div className="flex items-center gap-2"><MapPin className="size-4 text-brand-soft" />{e.venueName}</div>
                {e.org && <div className="flex items-center gap-2">{e.org.verified ? <BadgeCheck className="size-4 text-info" /> : <span className="size-4" />}{e.org.name}</div>}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <div><div className="text-xs text-muted">From</div><div className="text-xl font-bold">{e.minPrice == null ? '—' : ksh(e.minPrice)}</div></div>
                <Link to={`/e/${e.slug}`} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-on-brand shadow-[var(--shadow-glow)] transition hover:gap-3 hover:bg-brand-soft">
                  Get tickets <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
