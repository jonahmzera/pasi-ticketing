import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Theme } from './types';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

const TZ = 'Africa/Nairobi';
export const ksh = (n: number | null | undefined) => (n === 0 ? 'Free' : 'KSh ' + Number(n ?? 0).toLocaleString('en-KE'));
export const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-KE');
export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-KE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
export const fmtLongDate = (d: string | Date) => new Date(d).toLocaleDateString('en-KE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString('en-KE', { timeZone: TZ, day: 'numeric' });
export const fmtMon = (d: string | Date) => new Date(d).toLocaleDateString('en-KE', { timeZone: TZ, month: 'short' });
export const prettyPhone = (p?: string | null) => (p && p.startsWith('254') ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : p || '');

export function relDay(d: string | Date) {
  const day = (x: Date) => Math.floor((x.getTime() + 3 * 3600e3) / 864e5);
  const diff = day(new Date(d)) - day(new Date());
  if (diff === 0) return 'Tonight';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return new Date(d).toLocaleDateString('en-KE', { timeZone: TZ, weekday: 'long' });
  return fmtDate(d);
}

export const THEMES: Record<Theme, { from: string; via: string; to: string; ring: string }> = {
  sunset: { from: '#fb7185', via: '#c026d3', to: '#3b0764', ring: '#fb7185' },
  lime: { from: '#bef264', via: '#22c55e', to: '#064e3b', ring: '#4ade80' },
  violet: { from: '#c4b5fd', via: '#7c3aed', to: '#1e1b4b', ring: '#a78bfa' },
  ocean: { from: '#7dd3fc', via: '#2563eb', to: '#0c1445', ring: '#38bdf8' },
};
export const themeGradient = (t?: string) => {
  const x = THEMES[(t as Theme) || 'sunset'] ?? THEMES.sunset;
  return `linear-gradient(135deg, ${x.from} 0%, ${x.via} 50%, ${x.to} 100%)`;
};

export const initials = (s?: string | null) => (s || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
