import { motion } from 'motion/react';
import { Download, MapPin, Users } from 'lucide-react';
import type { EventLite, TicketLite } from '@shared/types';
import { LS } from '@/lib/hooks';
import { cn, fmtDate, fmtTime, themeGradient, THEMES } from '@shared/utils';
import { Button } from '@shared/ui';

export interface SavedTicket extends TicketLite { event: EventLite }

/** Tickets are kept on the device so they show at a venue with no signal. */
export const offline = {
  all: () => Object.values(LS.get<Record<string, SavedTicket>>('tickets', {})),
  get: (code: string) => LS.get<Record<string, SavedTicket>>('tickets', {})[code],
  save(tickets: TicketLite[], event: EventLite) {
    const m = LS.get<Record<string, SavedTicket>>('tickets', {});
    for (const t of tickets) if (t.status !== 'void') m[t.code] = { ...t, event };
    LS.set('tickets', m);
  },
  remove(code: string) { const m = LS.get<Record<string, SavedTicket>>('tickets', {}); delete m[code]; LS.set('tickets', m); },
};

export function TicketCard({ t, ev, index = 0, actions }: { t: TicketLite; ev: EventLite; index?: number; actions?: React.ReactNode }) {
  const dead = t.status !== 'valid';
  return (
    <motion.div initial={{ opacity: 0, y: 24, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-[28px] bg-white text-zinc-900 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
        <div className="grain relative p-5 text-white" style={{ backgroundImage: themeGradient(ev.theme) }}>
          {ev.posterUrl && <img src={ev.posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-40 mix-blend-luminosity" />}
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/80">{fmtDate(ev.startsAt)} · {fmtTime(ev.startsAt)}</div>
            <h3 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-tight">{ev.title}</h3>
            {ev.venueName && <div className="mt-1 flex items-center gap-1 text-sm text-white/85"><MapPin className="size-3.5" />{ev.venueName}</div>}
          </div>
        </div>
        {/* perforation */}
        <div className="relative h-0 border-t-2 border-dashed border-zinc-200">
          <span className="absolute -left-3 -top-3 size-6 rounded-full bg-bg" /><span className="absolute -right-3 -top-3 size-6 rounded-full bg-bg" />
        </div>
        <div className="relative grid place-items-center px-6 pb-4 pt-6">
          <img src={`/api/tickets/${t.code}/qr.svg`} alt="Ticket QR code — show at the gate" className={cn('size-56', dead && 'opacity-15')} />
          {dead && (
            <span className="absolute top-1/2 -translate-y-1/2 -rotate-12 rounded-xl border-4 px-4 py-1 text-3xl font-black tracking-wider"
              style={{ color: t.status === 'used' ? '#dc2626' : '#71717a', borderColor: 'currentColor' }}>
              {t.status === 'used' ? 'SCANNED' : 'TRANSFERRED'}
            </span>
          )}
          <div className="mt-2 font-mono text-xs tracking-wider text-zinc-500">{t.code}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-6 pb-6 text-sm">
          <div><div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Ticket</div><div className="font-bold">{t.typeName || 'Ticket'}</div></div>
          <div><div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Name</div><div className="truncate font-bold">{t.holderName || '—'}</div></div>
          {t.admits > 1 && <div className="col-span-2 flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold"><Users className="size-3.5" /> Admits {t.admits} people</div>}
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => downloadTicket(t, ev)}><Download className="size-4" />Save image</Button>
        {actions}
      </div>
    </motion.div>
  );
}

/** Render a ticket as a PNG for the phone's gallery (works offline). */
export async function downloadTicket(t: TicketLite, ev: EventLite) {
  const W = 720, H = 1140, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const th = THEMES[ev.theme] ?? THEMES.sunset;
  const rr = (a: number, b: number, w: number, h: number, r: number) => { x.beginPath(); x.roundRect(a, b, w, h, r); };
  x.fillStyle = '#05060d'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff'; rr(20, 20, W - 40, H - 40, 44); x.fill();
  const g = x.createLinearGradient(0, 0, W, 320); g.addColorStop(0, th.from); g.addColorStop(0.5, th.via); g.addColorStop(1, th.to);
  x.save(); rr(20, 20, W - 40, 320, 44); x.clip(); x.fillStyle = g; x.fillRect(20, 20, W - 40, 320); x.restore();
  x.fillStyle = 'rgba(255,255,255,.85)'; x.font = '600 26px Inter, system-ui'; x.fillText(`${fmtDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}`.toUpperCase(), 64, 92);
  x.fillStyle = '#fff'; x.font = '800 52px Inter, system-ui';
  let line = '', y = 160;
  for (const w of ev.title.split(' ')) { if (x.measureText(line + w).width > W - 128) { x.fillText(line, 64, y); line = ''; y += 60; } line += w + ' '; }
  x.fillText(line, 64, y);
  x.font = '500 26px Inter, system-ui'; x.fillStyle = 'rgba(255,255,255,.9)'; x.fillText(ev.venueName || '', 64, 300);
  x.setLineDash([14, 12]); x.strokeStyle = '#e4e4e7'; x.lineWidth = 3; x.beginPath(); x.moveTo(60, 360); x.lineTo(W - 60, 360); x.stroke(); x.setLineDash([]);
  const img = new Image(); img.src = `/api/tickets/${t.code}/qr.svg`; await img.decode().catch(() => {});
  x.drawImage(img, (W - 500) / 2, 400, 500, 500);
  x.textAlign = 'center'; x.fillStyle = '#71717a'; x.font = '500 24px "JetBrains Mono", monospace'; x.fillText(t.code, W / 2, 940);
  x.textAlign = 'left'; x.fillStyle = '#a1a1aa'; x.font = '700 18px Inter, system-ui'; x.fillText('TICKET', 64, 1000); x.fillText('NAME', W / 2 + 10, 1000);
  x.fillStyle = '#18181b'; x.font = '800 30px Inter, system-ui'; x.fillText(t.typeName || 'Ticket', 64, 1040); x.fillText(t.holderName || '—', W / 2 + 10, 1040);
  x.fillStyle = '#a1a1aa'; x.font = '500 18px Inter, system-ui'; x.textAlign = 'center'; x.fillText('pasi · one scan only · transfer only through the app', W / 2, 1090);
  const a = document.createElement('a');
  a.download = `ticket-${ev.slug}-${t.code.slice(0, 6)}.png`; a.href = c.toDataURL('image/png'); a.click();
}
