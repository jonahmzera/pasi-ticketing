import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { api, post, put } from '@shared/api';
import type { Theme, TicketStyle } from '@shared/types';
import { SAMPLE_QR, TICKET_STYLES, TicketArt } from '@shared/tickets';
import { cn, themeGradient } from '@shared/utils';
import { CATEGORY_ICONS, Poster } from '@shared/event';
import { Button, Field, Input, Select, Skeleton, Textarea } from '@shared/ui';

interface TT { id?: string; name: string; price: number | string; quantity: number | string; admits: number | string; description?: string; sold?: number }
interface Promo { code: string; percentOff: number | string; maxUses?: number | string; used?: number }
interface Form {
  title: string; category: string; theme: Theme; ticketStyle: TicketStyle; posterUrl: string; description: string; startsAt: string; endsAt: string; ageLimit: string; dressCode: string;
  venueName: string; address: string; lat?: number; lng?: number; maxPerBuyer: number | string; gatePin: string; lineup: string; ticketTypes: TT[]; promos: Promo[];
}

// datetime-local <-> ISO in Nairobi time
const toLocal = (iso?: string) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v + ':00+03:00').toISOString() : '');
const pinIcon = L.divIcon({ className: '', iconSize: [36, 36], iconAnchor: [18, 18], html: '<div style="width:36px;height:36px;border-radius:999px;background:#22c55e;box-shadow:0 0 0 5px rgba(34,197,94,.25)"></div>' });

function Picker({ pos, onPick }: { pos: [number, number]; onPick: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  const map = useMap();
  useEffect(() => { map.setView(pos, Math.max(map.getZoom(), 15)); }, [pos[0], pos[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Marker position={pos} icon={pinIcon} draggable eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onPick([ll.lat, ll.lng]); } }} />;
}

export default function EventEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['org-event', id], enabled: !!id, queryFn: () => api<Record<string, unknown>>(`/org/events/${id}`) });
  const [f, setF] = useState<Form>({
    title: '', category: 'Party', theme: 'sunset', ticketStyle: 'stub', posterUrl: '', description: '', startsAt: '', endsAt: '', ageLimit: '', dressCode: '',
    venueName: '', address: '', lat: -1.2864, lng: 36.8172, maxPerBuyer: 10, gatePin: '', lineup: '',
    ticketTypes: [{ name: 'Early Bird', price: 800, quantity: 100, admits: 1 }, { name: 'Regular', price: 1200, quantity: 300, admits: 1 }], promos: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = existing.data as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!e) return;
    setF({
      title: e.title, category: e.category, theme: e.theme, ticketStyle: e.ticketStyle || 'stub', posterUrl: e.posterUrl || '', description: e.description || '', startsAt: toLocal(e.startsAt), endsAt: toLocal(e.endsAt),
      ageLimit: e.ageLimit ? String(e.ageLimit) : '', dressCode: e.dressCode || '', venueName: e.venueName, address: e.address || '', lat: e.lat, lng: e.lng,
      maxPerBuyer: e.maxPerBuyer, gatePin: e.gatePin || '', lineup: (e.lineup || []).join(', '),
      ticketTypes: e.ticketTypes.map((t: TT) => ({ id: t.id, name: t.name, price: t.price, quantity: t.quantity, admits: t.admits, description: t.description, sold: t.sold })),
      promos: (e.promos || []).map((p: Promo) => ({ code: p.code, percentOff: p.percentOff, maxUses: p.maxUses ?? '', used: p.used })),
    });
  }, [existing.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const upTT = (i: number, k: keyof TT, v: string) => set('ticketTypes', f.ticketTypes.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const upPromo = (i: number, k: keyof Promo, v: string) => set('promos', f.promos.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function findAddress() {
    const q = [f.venueName, f.address, 'Kenya'].filter(Boolean).join(', ');
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ke&q=' + encodeURIComponent(q)).then((x) => x.json()).catch(() => []);
    if (!r[0]) return toast('Not found — click the map to drop the pin instead');
    set('lat', Number(r[0].lat)); set('lng', Number(r[0].lon));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...f, startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), lineup: f.lineup.split(',').map((s) => s.trim()).filter(Boolean) };
      const r = id ? await put<{ id: string }>(`/org/events/${id}`, body) : await post<{ id: string }>('/org/events', body);
      qc.invalidateQueries(); toast.success(id ? 'Saved' : 'Draft created — publish it when you’re ready');
      nav(`/events/${r.id}`);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  if (id && existing.isLoading) return <Skeleton className="h-96" />;
  return (
    <form onSubmit={save} className="space-y-6 pb-24">
      <div><div className="eyebrow">{id ? 'Edit event' : 'New event'}</div><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{f.title || 'Untitled event'}</h1></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">Basics</h2>
            <Field label="Event title"><Input value={f.title} onChange={(e) => set('title', e.target.value)} required placeholder="e.g. Rooftop Amapiano Sundowner" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category"><Select value={f.category} onChange={(e) => set('category', e.target.value)}>{Object.keys(CATEGORY_ICONS).map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Lineup / highlights" hint="Comma separated"><Input value={f.lineup} onChange={(e) => set('lineup', e.target.value)} placeholder="DJ Kaytrix, MC Raz" /></Field>
            </div>
            <Field label="Description"><Textarea rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What should people know? Doors, parking, food, vibe…" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts (Nairobi time)"><Input type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} required /></Field>
              <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
              <Field label="Age limit"><Input type="number" value={f.ageLimit} onChange={(e) => set('ageLimit', e.target.value)} placeholder="e.g. 18" /></Field>
              <Field label="Dress code"><Input value={f.dressCode} onChange={(e) => set('dressCode', e.target.value)} placeholder="optional" /></Field>
            </div>
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">Venue</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue name"><Input value={f.venueName} onChange={(e) => set('venueName', e.target.value)} required /></Field>
              <Field label="Address"><div className="flex gap-2"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /><Button type="button" variant="secondary" size="icon" className="h-12 w-12 shrink-0" onClick={findAddress} aria-label="Find on map"><Search className="size-4" /></Button></div></Field>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line">
              <MapContainer center={[f.lat ?? -1.2864, f.lng ?? 36.8172]} zoom={13} className="map-dark h-64 w-full">
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
                <Picker pos={[f.lat ?? -1.2864, f.lng ?? 36.8172]} onPick={([a, b]) => setF((s) => ({ ...s, lat: a, lng: b }))} />
              </MapContainer>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5" />Click the map or drag the pin to the exact gate. Fans get directions, travel time and nearby hotels from it.</p>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Tickets</h2>
              <Button type="button" size="sm" variant="secondary" onClick={() => set('ticketTypes', [...f.ticketTypes, { name: '', price: 0, quantity: 100, admits: 1 }])}><Plus className="size-4" />Add type</Button></div>
            <p className="mt-1 text-xs text-muted">Tip: a “Squad of 4” or “Table for 6” (admits more than 1) sells faster to groups.</p>
            <div className="mt-4 space-y-3">
              {f.ticketTypes.map((t, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface-2 p-3 sm:grid-cols-[2fr_1fr_1fr_90px_44px] sm:items-end">
                  <Field label="Name" className="col-span-2 sm:col-span-1"><Input value={t.name} onChange={(e) => upTT(i, 'name', e.target.value)} placeholder="Regular" /></Field>
                  <Field label="Price (KSh)"><Input type="number" min={0} value={t.price} onChange={(e) => upTT(i, 'price', e.target.value)} /></Field>
                  <Field label={t.sold ? `Qty (${t.sold} sold)` : 'Quantity'}><Input type="number" min={0} value={t.quantity} onChange={(e) => upTT(i, 'quantity', e.target.value)} /></Field>
                  <Field label="Admits"><Input type="number" min={1} value={t.admits} onChange={(e) => upTT(i, 'admits', e.target.value)} /></Field>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove ticket type" disabled={!!t.sold} onClick={() => set('ticketTypes', f.ticketTypes.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Ticket design</h2>
            <p className="mt-1 text-xs text-muted">This is what buyers see on their phone and show at the gate. Every design keeps the QR on white so it scans fast.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Ticket design">
              {TICKET_STYLES.map((d) => (
                <button type="button" key={d.id} role="radio" aria-checked={f.ticketStyle === d.id} onClick={() => set('ticketStyle', d.id)}
                  className={cn('group overflow-hidden rounded-2xl border bg-surface-2 text-left transition', f.ticketStyle === d.id ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-line-strong')}>
                  <div className="pointer-events-none relative h-56 overflow-hidden bg-bg">
                    <div className="absolute left-1/2 top-4 w-[384px] origin-top -translate-x-1/2 scale-[.55]">
                      <TicketArt style={d.id} t={{ code: 'PREVIEW123.abcdefgh', status: 'valid', holderName: 'Wanjiku M.', typeName: f.ticketTypes[0]?.name || 'Regular', admits: 1 }}
                        ev={{ slug: 'preview', title: f.title || 'Your event', venueName: f.venueName || 'Your venue', address: f.address, startsAt: fromLocal(f.startsAt) || new Date().toISOString(), theme: f.theme, posterUrl: f.posterUrl || undefined, category: f.category }}
                        qrSrc={SAMPLE_QR} />
                    </div>
                  </div>
                  <div className="p-3"><div className="font-semibold">{d.name}{d.id === 'stub' && <span className="ml-2 text-xs font-normal text-muted">default</span>}</div><div className="text-xs text-muted">{d.blurb}</div></div>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div className="card space-y-4 p-5">
              <h2 className="font-semibold">Anti-scalping & gate</h2>
              <Field label="Max tickets per buyer" hint="Enforced per M-Pesa number, so bots and touts can’t bulk-buy."><Input type="number" min={1} value={f.maxPerBuyer} onChange={(e) => set('maxPerBuyer', e.target.value)} /></Field>
              <Field label="Gate scanner PIN" hint="Share with door staff. Auto-generated if empty."><Input value={f.gatePin} onChange={(e) => set('gatePin', e.target.value)} inputMode="numeric" placeholder="auto" /></Field>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Promo codes</h2>
                <Button type="button" size="sm" variant="secondary" onClick={() => set('promos', [...f.promos, { code: '', percentOff: 10 }])}><Plus className="size-4" />Add</Button></div>
              <div className="mt-3 space-y-2">
                {f.promos.length === 0 && <p className="text-sm text-muted">e.g. EARLY10 for 10% off your first 100 buyers.</p>}
                {f.promos.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_80px] gap-2">
                    <Input value={p.code} onChange={(e) => upPromo(i, 'code', e.target.value.toUpperCase())} placeholder="CODE" aria-label="Code" className="font-mono" />
                    <Input type="number" value={p.percentOff} onChange={(e) => upPromo(i, 'percentOff', e.target.value)} aria-label="Percent off" placeholder="%" />
                    <Input type="number" value={p.maxUses ?? ''} onChange={(e) => upPromo(i, 'maxUses', e.target.value)} aria-label="Max uses" placeholder="Max" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Preview + look */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card p-4">
            <div className="eyebrow mb-3">Preview</div>
            <Poster ev={f} className="aspect-[4/3]"><div className="absolute inset-x-3 bottom-3 text-lg font-bold leading-tight">{f.title || 'Your event'}</div></Poster>
          </div>
          <div className="card space-y-4 p-4">
            <Field label="Poster image URL" hint="Paste a link to your poster. Without one we generate artwork."><Input value={f.posterUrl} onChange={(e) => set('posterUrl', e.target.value)} placeholder="https://…" /></Field>
            <div>
              <div className="mb-2 text-[13px] font-medium text-muted">Colour</div>
              <div className="flex gap-2">
                {(['sunset', 'lime', 'violet', 'ocean'] as Theme[]).map((t) => (
                  <button type="button" key={t} aria-label={t} onClick={() => set('theme', t)} className={cn('size-11 rounded-xl ring-offset-2 ring-offset-surface transition', f.theme === t && 'ring-2 ring-fg')} style={{ backgroundImage: themeGradient(t) }} />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-xl lg:left-[260px]">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 py-3 sm:px-8">
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy}>{id ? 'Save changes' : 'Save draft'}</Button>
        </div>
      </div>
    </form>
  );
}
