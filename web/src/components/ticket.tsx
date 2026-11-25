import { motion } from 'motion/react';
import { Download } from 'lucide-react';
import { TicketArt } from '@shared/tickets';
import type { EventLite, TicketLite } from '@shared/types';
import { LS } from '@/lib/hooks';
import { fmtDate, fmtTime, THEMES } from '@shared/utils';
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
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-sm flex-col items-center">
      <TicketArt style={ev.ticketStyle} t={t} ev={ev} />
      <div className="mt-6 flex justify-center gap-2">
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
