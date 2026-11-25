// Four ticket designs. The organizer picks one per event; buyers see it on their phone.
// Every design keeps the QR on plain white with a quiet zone, so gate scanners read it fast.
import { useState, type PointerEvent, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { MapPin, RotateCw, Users } from 'lucide-react';
import type { EventLite, TicketLite, TicketStyle } from './types';
import { cn, fmtDate, fmtTime, THEMES } from './utils';

export const TICKET_STYLES: { id: TicketStyle; name: string; blurb: string }[] = [
  { id: 'stub', name: 'Tear-off stub', blurb: 'Classic paper ticket. The stub tears away once it’s scanned.' },
  { id: 'admit', name: 'Admit One', blurb: 'Bold printed ticket with a grainy finish and 3D tilt.' },
  { id: 'boarding', name: 'Boarding pass', blurb: 'Flight-pass layout. Tap to flip for venue details.' },
  { id: 'holo', name: 'Holographic VIP', blurb: 'Shimmering foil that shifts as you tilt. Made for VIP and tables.' },
];

interface Props { style?: TicketStyle; t: TicketLite; ev: EventLite; qrSrc?: string }

export function TicketArt({ style = 'stub', ...p }: Props) {
  const C = { stub: StubTicket, admit: AdmitTicket, boarding: BoardingTicket, holo: HoloTicket }[style] ?? StubTicket;
  return <C {...p} />;
}

// ---------- shared bits ----------
const qrOf = (p: Props) => p.qrSrc ?? `/api/tickets/${p.t.code}/qr.svg`;
const shortCode = (code: string) => code.split('.')[0];

function Qr({ p, size = 'size-44', className }: { p: Props; size?: string; className?: string }) {
  const dead = p.t.status !== 'valid';
  return (
    <div className={cn('relative grid place-items-center rounded-2xl bg-white p-2.5', className)}>
      <img src={qrOf(p)} alt="Ticket QR code. Show this at the gate." className={cn(size, dead && 'opacity-15')} draggable={false} />
      {dead && (
        <span className="absolute -rotate-12 rounded-lg border-[3px] px-2.5 py-0.5 text-xl font-black tracking-wider"
          style={{ color: p.t.status === 'used' ? '#dc2626' : '#71717a', borderColor: 'currentColor' }}>
          {p.t.status === 'used' ? 'SCANNED' : 'TRANSFERRED'}
        </span>
      )}
    </div>
  );
}

function Field({ k, v, className }: { k: string; v: ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}><div className="text-[9px] font-semibold uppercase tracking-[.16em] opacity-55">{k}</div><div className="truncate text-sm font-bold">{v}</div></div>;
}

/** Pointer tilt with a light glare that follows the finger/mouse. */
function useTilt(max = 10) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });
  const gx = useTransform(mx, [0, 1], [0, 100]), gy = useTransform(my, [0, 1], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,.35), transparent 55%)`;
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => { mx.set(0.5); my.set(0.5); };
  return { style: reduce ? {} : { rotateX: rx, rotateY: ry, transformPerspective: 900 }, glare, mx, my, handlers: { onPointerMove: onMove, onPointerLeave: onLeave } };
}

// ---------- T2: Tear-off stub (default) ----------
function StubTicket(p: Props) {
  const { t, ev } = p;
  const used = t.status === 'used';
  return (
    <div className="group w-full max-w-sm select-none" style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.55))' }}>
      <div className="relative rounded-t-[22px] bg-[#f3ecdf] px-6 pb-6 pt-5 text-[#1d1a16]"
        style={{ backgroundImage: 'radial-gradient(rgba(60,40,20,.06) 1px, transparent 1px)', backgroundSize: '4px 4px' }}>
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[.2em] opacity-70">
          <span>{fmtDate(ev.startsAt)}</span><span>{fmtTime(ev.startsAt)}</span>
        </div>
        <h3 className="mt-3 font-display text-[28px] font-bold italic leading-[1.05]">{ev.title}</h3>
        {ev.venueName && <div className="mt-2 flex items-center gap-1 text-sm opacity-75"><MapPin className="size-3.5" />{ev.venueName}</div>}
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#1d1a16]/15 pt-4">
          <Field k="Ticket" v={t.typeName || 'General'} className="col-span-2" />
          <Field k="Admits" v={t.admits || 1} />
          <Field k="Name" v={t.holderName || '—'} className="col-span-3" />
        </div>
      </div>
      {/* Stub: hangs on the perforation; tears away once scanned */}
      <motion.div
        initial={false}
        animate={used ? { rotate: 7, y: 10, x: 6 } : { rotate: 0, y: 0, x: 0 }}
        whileHover={used ? undefined : { rotate: 1.5, y: 2 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}
        style={{ transformOrigin: '0% 0%' }}
        className="relative rounded-b-[22px] bg-[#f3ecdf] px-6 pb-5 pt-6 text-[#1d1a16]">
        <div className="absolute inset-x-5 top-0 border-t-2 border-dashed border-[#1d1a16]/25" />
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-bg" /><span className="absolute -right-3 -top-3 size-6 rounded-full bg-bg" />
        <div className="flex items-center gap-4">
          <Qr p={p} size="size-36" className="shrink-0 bg-white" />
          <div className="min-w-0 space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[.22em] opacity-60">Admit · scan once</div>
            <div className="font-mono text-xs font-bold tracking-wider">{shortCode(t.code)}</div>
            <Barcode seed={t.code} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Barcode({ seed }: { seed: string }) {
  const bars = [...seed.replace(/\W/g, '')].slice(0, 22).map((c) => 1 + (c.charCodeAt(0) % 3));
  return <div aria-hidden className="flex h-8 items-stretch gap-[2px]">{bars.map((w, i) => <span key={i} className="bg-[#1d1a16]" style={{ width: w }} />)}</div>;
}

// ---------- T1: Admit One ----------
function AdmitTicket(p: Props) {
  const { t, ev } = p;
  const th = THEMES[ev.theme] ?? THEMES.sunset;
  const tilt = useTilt(9);
  return (
    <motion.div {...tilt.handlers} style={tilt.style} className="relative w-full max-w-sm select-none overflow-hidden rounded-[22px] shadow-[0_30px_80px_-30px_rgba(0,0,0,.85)]">
      <div className="relative overflow-hidden px-6 pb-6 pt-5 text-[#1b0c05]" style={{ background: `linear-gradient(160deg, ${th.from}, ${th.via})` }}>
        {/* dither / halftone texture */}
        <div aria-hidden className="absolute inset-0 opacity-30 mix-blend-multiply" style={{ backgroundImage: 'radial-gradient(#000 0.8px, transparent 1.1px)', backgroundSize: '5px 5px' }} />
        {ev.posterUrl && <img src={ev.posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25 mix-blend-multiply grayscale" />}
        <div className="relative pr-12">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[.18em]">{fmtDate(ev.startsAt)} · {fmtTime(ev.startsAt)}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[.18em] opacity-80">{ev.title}</div>
          <div className="mt-5 text-[40px] font-black uppercase leading-[.92] tracking-tight">{t.holderName || 'Guest'}</div>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-[.16em]">{ev.venueName}</div>
        </div>
        <div className="absolute inset-y-0 right-0 flex w-14 items-center justify-center border-l-2 border-dashed border-black/30">
          <span className="rotate-90 whitespace-nowrap text-2xl font-black tracking-[.18em]">ADMIT ONE</span>
        </div>
        <span className="absolute -bottom-3 right-[44px] size-6 rounded-full bg-bg" /><span className="absolute -top-3 right-[44px] size-6 rounded-full bg-bg" />
      </div>
      <div className="flex items-center gap-4 bg-[#141414] px-6 py-5 text-white">
        <Qr p={p} size="size-32" />
        <div className="min-w-0 space-y-2">
          <Field k="Ticket" v={t.typeName || 'General'} />
          {t.admits > 1 && <Field k="Admits" v={<span className="inline-flex items-center gap-1"><Users className="size-3.5" />{t.admits}</span>} />}
          <div className="font-mono text-[11px] tracking-wider text-white/60">{shortCode(t.code)}</div>
        </div>
      </div>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ background: tilt.glare }} />
    </motion.div>
  );
}

// ---------- T3: Boarding pass (tap to flip) ----------
function BoardingTicket(p: Props) {
  const { t, ev } = p;
  const [flipped, setFlipped] = useState(false);
  const area = (ev.address || ev.venueName || '').split(',').slice(-2, -1)[0]?.trim() || 'Nairobi';
  const code3 = (s: string) => s.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'EVT';
  const face = 'absolute inset-0 overflow-hidden rounded-[22px] bg-[#ece6d6] text-[#262217] [backface-visibility:hidden]';
  return (
    <div className="w-full max-w-sm select-none [perspective:1200px]">
      <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="relative h-[460px] [transform-style:preserve-3d]" style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.55))' }}>
        {/* front */}
        <div className={face}>
          <div className="flex items-center justify-between bg-[#262217] px-5 py-3 font-mono text-[10px] uppercase tracking-[.22em] text-[#ece6d6]">
            <span>Boarding pass</span><span>{t.typeName?.toUpperCase().slice(0, 14) || 'GENERAL'}</span>
          </div>
          <div className="px-5 pt-4">
            <div className="flex items-end justify-between">
              <div><div className="font-mono text-[10px] tracking-[.2em] opacity-60">FROM</div><div className="text-3xl font-black">{code3(area)}</div><div className="text-[11px] opacity-70">{area}</div></div>
              <div className="mb-3 flex-1 px-3"><div className="border-t-2 border-dotted border-[#262217]/40" /></div>
              <div className="text-right"><div className="font-mono text-[10px] tracking-[.2em] opacity-60">TO</div><div className="text-3xl font-black">{code3(ev.title)}</div><div className="max-w-28 truncate text-[11px] opacity-70">{ev.venueName}</div></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-y border-[#262217]/15 py-3">
              <Field k="Date" v={fmtDate(ev.startsAt)} /><Field k="Boarding" v={fmtTime(ev.startsAt)} /><Field k="Admits" v={t.admits || 1} />
              <Field k="Passenger" v={t.holderName || '—'} className="col-span-3" />
            </div>
          </div>
          <div className="relative mx-5 mt-4 border-t-2 border-dashed border-[#262217]/25">
            <span className="absolute -left-8 -top-3 size-6 rounded-full bg-bg" /><span className="absolute -right-8 -top-3 size-6 rounded-full bg-bg" />
          </div>
          <div className="flex items-center gap-4 px-5 pt-4">
            <Qr p={p} size="size-32" className="shrink-0" />
            <div className="space-y-2">
              <div className="font-mono text-xs font-bold tracking-wider">{shortCode(t.code)}</div>
              <button type="button" onClick={() => setFlipped(true)} className="inline-flex items-center gap-1.5 rounded-full bg-[#262217] px-3 py-1.5 text-xs font-semibold text-[#ece6d6]">
                <RotateCw className="size-3.5" />Venue details
              </button>
            </div>
          </div>
        </div>
        {/* back */}
        <div className={cn(face, '[transform:rotateY(180deg)] flex flex-col px-6 py-6')}>
          <div className="font-mono text-[10px] uppercase tracking-[.22em] opacity-60">Gate information</div>
          <h3 className="mt-2 text-2xl font-black leading-tight">{ev.title}</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Field k="Venue" v={ev.venueName} /><Field k="Address" v={ev.address || '—'} />
            <Field k="Doors" v={`${fmtDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}`} />
          </div>
          <p className="mt-4 text-xs opacity-70">One scan per ticket. Transfers only through the app — screenshots stop working once scanned.</p>
          <button type="button" onClick={() => setFlipped(false)} className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-[#262217] px-3 py-1.5 text-xs font-semibold text-[#ece6d6]">
            <RotateCw className="size-3.5" />Show QR
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------- T4: Holographic VIP ----------
function HoloTicket(p: Props) {
  const { t, ev } = p;
  const tilt = useTilt(12);
  const hue = useTransform(tilt.mx, [0, 1], [0, 120]);
  const foil = useMotionTemplate`linear-gradient(${useTransform(tilt.my, [0, 1], [100, 160])}deg, hsl(${hue} 90% 70% / .55), hsl(calc(${hue} + 90) 90% 65% / .45), hsl(calc(${hue} + 200) 90% 70% / .55))`;
  return (
    <motion.div {...tilt.handlers} style={tilt.style} className="relative w-full max-w-sm select-none overflow-hidden rounded-[22px] bg-[#0b0b14] text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] ring-1 ring-white/10">
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-color-dodge" style={{ background: foil }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,.18) 0 1px, transparent 1px 6px)' }} />
      <div className="relative px-6 pb-5 pt-5 pr-16">
        <div className="font-mono text-[10px] uppercase tracking-[.22em] text-white/70">{fmtDate(ev.startsAt)} · {fmtTime(ev.startsAt)} · {ev.venueName}</div>
        <div className="mt-4 text-[36px] font-black uppercase leading-[.95] tracking-tight">{t.holderName || 'Guest'}</div>
        <div className="mt-2 text-sm text-white/75">{ev.title}</div>
        <div className="mt-4 flex gap-5"><Field k="Access" v={t.typeName || 'VIP'} />{t.admits > 1 && <Field k="Admits" v={t.admits} />}</div>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-12 items-center justify-center border-l border-white/15">
        <span className="rotate-90 whitespace-nowrap font-display text-xl font-bold italic tracking-[.12em]">VIP Access</span>
      </div>
      <div className="relative flex items-center gap-4 border-t border-white/10 bg-black/40 px-6 py-5 backdrop-blur">
        <Qr p={p} size="size-32" />
        <div className="font-mono text-[11px] tracking-wider text-white/70">{shortCode(t.code)}<div className="mt-1 text-[10px] uppercase tracking-[.2em] text-white/50">Tilt to verify foil</div></div>
      </div>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ background: tilt.glare }} />
    </motion.div>
  );
}

/** A believable QR-like pattern for previews (not scannable). */
export const SAMPLE_QR = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 21' shape-rendering='crispEdges'><rect width='21' height='21' fill='#fff'/>${
    Array.from({ length: 21 * 21 }, (_, i) => { const x = i % 21, y = Math.floor(i / 21);
      const finder = (a: number, b: number) => x >= a && x < a + 7 && y >= b && y < b + 7 && (x === a || x === a + 6 || y === b || y === b + 6 || (x > a + 1 && x < a + 5 && y > b + 1 && y < b + 5));
      const inF = (a: number, b: number) => x >= a && x < a + 7 && y >= b && y < b + 7;
      const on = inF(0, 0) || inF(14, 0) || inF(0, 14) ? finder(0, 0) || finder(14, 0) || finder(0, 14) : ((x * 7 + y * 13 + x * y) % 5) < 2;
      return on ? `<rect x='${x}' y='${y}' width='1' height='1' fill='#0b0b12'/>` : ''; }).join('')}</svg>`)}`;
