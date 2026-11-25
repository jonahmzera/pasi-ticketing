// Venue map, trip planning (OSRM routing + Nairobi traffic factor) and nearby places (OpenStreetMap).
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import { Bed, Car, Clock, Coffee, ExternalLink, LocateFixed, Navigation, ParkingSquare, Route, UtensilsCrossed, Wallet } from 'lucide-react';
import { api } from '@shared/api';
import { cn, ksh } from '@shared/utils';
import { Button, Segmented, Skeleton } from '@shared/ui';

const pin = (bg: string, svg: string, size = 34) => L.divIcon({
  className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};display:grid;place-items:center;box-shadow:0 0 0 4px rgba(5,6,13,.6),0 8px 20px rgba(0,0,0,.5);color:#05060d">${svg}</div>`,
});
const SVG = {
  venue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
  me: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>',
  dot: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>',
};

interface Place { name: string; type: string; lat: number; lng: number; dist: number; stars?: string }
type Kind = 'stay' | 'eat' | 'park';
const KIND_COLOR: Record<Kind, string> = { stay: '#a78bfa', eat: '#fbbf24', park: '#38bdf8' };

function km(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
/** Free routing engines ignore Nairobi rush hour; scale by time of day. */
export const trafficFactor = (h: number) => (h >= 6 && h < 10 ? 1.9 : h >= 16 && h < 20 ? 2 : h >= 22 || h < 5 ? 1.05 : 1.35);
const eatHour = (d: Date) => Number(d.toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false }));
const hhmm = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });

function Fit({ bounds }: { bounds?: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [40, 40] }); }, [bounds, map]);
  return null;
}

export function VenueExplorer({ ev }: { ev: { slug: string; lat?: number; lng?: number; venueName?: string; address?: string; startsAt: string } }) {
  const [route, setRoute] = useState<{ line: [number, number][]; km: number; min: number; from: [number, number] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState<Kind>('stay');
  const nearby = useQuery({
    queryKey: ['nearby', ev.slug], enabled: ev.lat != null, staleTime: 36e5, retry: 1,
    queryFn: () => api<{ lat: number; lng: number; tags: Record<string, string> }[]>(`/events/${ev.slug}/nearby`),
  });
  const places = useMemo(() => {
    const out: Record<Kind, Place[]> = { stay: [], eat: [], park: [] };
    for (const el of nearby.data ?? []) {
      if (el.lat == null) continue;
      const k: Kind = el.tags.tourism ? 'stay' : el.tags.amenity === 'parking' ? 'park' : 'eat';
      if (k !== 'park' && !el.tags.name) continue;
      out[k].push({ name: el.tags.name || 'Parking', type: (el.tags.tourism || el.tags.amenity || '').replace('_', ' '), lat: el.lat, lng: el.lng, dist: km(ev.lat!, ev.lng!, el.lat, el.lng), stars: el.tags.stars });
    }
    for (const k of Object.keys(out) as Kind[]) out[k].sort((a, b) => a.dist - b.dist);
    return out;
  }, [nearby.data, ev.lat, ev.lng]);

  if (ev.lat == null || ev.lng == null) return null;
  const venue: [number, number] = [ev.lat, ev.lng];

  function locate() {
    setLocating(true); setErr('');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const from: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${ev.lng},${ev.lat}?overview=full&geometries=geojson`).then((x) => x.json());
        const rt = r.routes?.[0];
        if (!rt) throw new Error();
        setRoute({ line: rt.geometry.coordinates.map(([a, b]: [number, number]) => [b, a]), km: rt.distance / 1000, min: rt.duration / 60, from });
      } catch { setErr('Could not plan a route right now — try Google Maps.'); }
      setLocating(false);
    }, () => { setErr('Allow location access to plan your trip.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden p-0">
        <MapContainer center={venue} zoom={15} scrollWheelZoom={false} className="map-dark h-72 w-full sm:h-80">
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          <Marker position={venue} icon={pin('#22c55e', SVG.venue, 40)}><Popup><b>{ev.venueName}</b></Popup></Marker>
          {places[kind].slice(0, 25).map((p) => (
            <Marker key={p.name + p.lat} position={[p.lat, p.lng]} icon={pin(KIND_COLOR[kind], SVG.dot, 20)}><Popup>{p.name} · {p.dist.toFixed(1)} km</Popup></Marker>
          ))}
          {route && <><Polyline positions={route.line} pathOptions={{ color: '#4ade80', weight: 5, opacity: 0.9 }} /><Marker position={route.from} icon={pin('#f5f6fb', SVG.me, 24)} /><Fit bounds={route.line} /></>}
        </MapContainer>
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          <a className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}`}><Navigation className="size-4" />Google Maps</a>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2" target="_blank" rel="noopener" href={`https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${ev.lat}&dropoff[longitude]=${ev.lng}&dropoff[nickname]=${encodeURIComponent(ev.venueName || '')}`}><Car className="size-4" />Uber</a>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2" target="_blank" rel="noopener" href="https://bolt.eu/en-ke/rides/"><Car className="size-4" />Bolt</a>
        </div>
      </div>

      <TripPlanner startsAt={ev.startsAt} route={route} onLocate={locate} locating={locating} err={err} />

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Around the venue</h3>
          <span className="text-xs text-subtle">from OpenStreetMap</span>
        </div>
        <Segmented<Kind> value={kind} onChange={setKind} options={[
          { value: 'stay', label: <><Bed className="size-4" />Stays</> }, { value: 'eat', label: <><UtensilsCrossed className="size-4" />Food & drinks</> }, { value: 'park', label: <><ParkingSquare className="size-4" />Parking</> },
        ]} />
        <div className="mt-3 divide-y divide-line">
          {nearby.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-12" />)
            : nearby.isError ? <p className="py-4 text-sm text-muted">Places are unavailable right now.</p>
              : places[kind].length === 0 ? <p className="py-4 text-sm text-muted">Nothing listed nearby — try the links below.</p>
                : places[kind].slice(0, 8).map((p) => (
                  <a key={p.name + p.lat} target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}%20${p.lat},${p.lng}`}
                    className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: KIND_COLOR[kind] + '22', color: KIND_COLOR[kind] }}>
                      {kind === 'stay' ? <Bed className="size-4" /> : kind === 'eat' ? <Coffee className="size-4" /> : <ParkingSquare className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block text-xs capitalize text-muted">{p.type}{p.stars ? ` · ${'★'.repeat(Number(p.stars) || 0)}` : ''}</span></span>
                    <span className="text-xs tabular-nums text-muted">{p.dist < 1 ? `${Math.round(p.dist * 1000)} m` : `${p.dist.toFixed(1)} km`}</span>
                  </a>
                ))}
        </div>
        {kind === 'stay' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ff385c]/15 text-sm font-semibold text-[#ff7a92] hover:bg-[#ff385c]/25" target="_blank" rel="noopener"
              href={`https://www.airbnb.com/s/${encodeURIComponent(ev.address || ev.venueName || 'Nairobi')}/homes?checkin=${ev.startsAt.slice(0, 10)}&checkout=${new Date(new Date(ev.startsAt).getTime() + 864e5).toISOString().slice(0, 10)}`}>Airbnb <ExternalLink className="size-3.5" /></a>
            <a className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#3b82f6]/15 text-sm font-semibold text-[#7fb0ff] hover:bg-[#3b82f6]/25" target="_blank" rel="noopener"
              href={`https://www.booking.com/searchresults.html?latitude=${ev.lat}&longitude=${ev.lng}&checkin=${ev.startsAt.slice(0, 10)}&checkout=${new Date(new Date(ev.startsAt).getTime() + 864e5).toISOString().slice(0, 10)}`}>Booking.com <ExternalLink className="size-3.5" /></a>
          </div>
        )}
      </div>
    </div>
  );
}

function TripPlanner({ startsAt, route, onLocate, locating, err }: {
  startsAt: string; route: { km: number; min: number } | null; onLocate: () => void; locating: boolean; err: string;
}) {
  const start = new Date(startsAt);
  const suggested = useMemo(() => {
    if (!route) return null;
    const arriveBy = new Date(start.getTime() - 15 * 60e3);
    let leave = new Date(arriveBy.getTime() - route.min * 60e3);
    for (let i = 0; i < 3; i++) leave = new Date(arriveBy.getTime() - route.min * trafficFactor(eatHour(leave)) * 60e3);
    return leave;
  }, [route, startsAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [leaveAt, setLeaveAt] = useState('');
  useEffect(() => { if (suggested) setLeaveAt(hhmm(suggested)); }, [suggested]);

  if (!route) {
    return (
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <span className="grid size-11 place-items-center rounded-xl bg-brand/15 text-brand-soft"><Route className="size-5" /></span>
        <div className="min-w-0 flex-1"><div className="font-semibold">Plan your trip</div><div className="text-sm text-muted">Travel time from where you are, with Nairobi traffic factored in.</div>{err && <div className="mt-1 text-sm text-danger">{err}</div>}</div>
        <Button variant="primary" onClick={onLocate} loading={locating}><LocateFixed className="size-4" />Use my location</Button>
      </div>
    );
  }
  const [h, m] = (leaveAt || '00:00').split(':').map(Number);
  const dur = Math.round(route.min * trafficFactor(h));
  const arr = (h * 60 + m + dur) % 1440;
  const late = arr > eatHour(start) * 60 + start.getUTCMinutes();
  return (
    <div className="card p-4">
      <div className="grid grid-cols-3 gap-2">
        {[[Route, `${route.km.toFixed(1)} km`, 'by road'], [Clock, dur >= 60 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : `${dur} min`, 'with traffic'], [Wallet, `~${ksh(Math.round((150 + route.km * 45) / 10) * 10)}`, 'ride estimate']]
          .map(([I, v, l]) => { const Icon = I as typeof Route; return (
            <div key={l as string} className="rounded-xl bg-surface-2 p-3"><Icon className="mb-2 size-4 text-muted" /><div className="text-lg font-bold tabular-nums">{v as string}</div><div className="text-xs text-muted">{l as string}</div></div>
          ); })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
        <label htmlFor="leave" className="text-sm text-muted">If I leave at</label>
        <input id="leave" type="time" value={leaveAt} onChange={(e) => setLeaveAt(e.target.value)} className="h-10 rounded-lg border border-line bg-surface-2 px-2 font-semibold tabular-nums outline-none focus:border-brand" />
        <span className="text-sm">→ arrive <b className={cn('tabular-nums', late ? 'text-warn' : 'text-brand-soft')}>{String(Math.floor(arr / 60)).padStart(2, '0')}:{String(arr % 60).padStart(2, '0')}</b></span>
      </div>
      {suggested && <p className="mt-3 text-sm text-muted">Leave by <b className="text-fg">{hhmm(suggested)}</b> to get there 15 minutes before it starts.</p>}
    </div>
  );
}
