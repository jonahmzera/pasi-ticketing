/// <reference lib="webworker" />
// Service worker: precached app shell, offline tickets, push notifications.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// SPA navigations fall back to the cached shell when offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));
// Ticket QR codes never change: cache forever so they show at a venue with no signal.
registerRoute(({ url }) => /^\/api\/tickets\/[^/]+\/qr\.svg$/.test(url.pathname), new CacheFirst({ cacheName: 'pasi-qr' }));
// Ticket / order / my-tickets data: network first, last copy when offline.
registerRoute(({ url }) => /^\/api\/(tickets\/[^/]+|me\/tickets|orders\/[^/]+)$/.test(url.pathname), new NetworkFirst({ cacheName: 'pasi-tickets', networkTimeoutSeconds: 4 }));
// Event images
registerRoute(({ url }) => url.hostname === 'images.unsplash.com', new CacheFirst({ cacheName: 'pasi-images' }));

self.addEventListener('push', (e) => {
  let d: { title?: string; body?: string; url?: string } = {};
  try { d = e.data?.json() ?? {}; } catch { d = { title: 'Pasi', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pasi', { body: d.body, icon: '/icon.svg', badge: '/icon.svg', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data as { url?: string })?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.location.origin)) as WindowClient | undefined;
    if (c) { c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  }));
});
