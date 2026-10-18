/* ════════════ Kinokompass – Service Worker (nur Web-App) ════════════
   App-Dateien: sofort aus dem Speicher, im Hintergrund aktualisiert (stale-while-revalidate).
   Poster/Bilder von TMDB: einmal laden, dann aus dem Speicher (höchstens ~600).
   Filmdatenbank-Antworten: erst Netz, ohne Netz die letzte gespeicherte Antwort.
   GitHub/OMDb: immer direkt (Sync und Schlüssel werden nie zwischengespeichert).
   VERSION wird beim Veröffentlichen durch den Commit ersetzt → neue Version = neuer Speicher. */
const VERSION = 'e1e3234269';
const APP = 'kk-app-' + VERSION, IMG = 'kk-img', API = 'kk-api';

self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(['./', './index.html', './styles.css', './icon.png'])).catch(() => { })); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kk-app-') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

async function trim(name, max) { const c = await caches.open(name), keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k); }

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.open(APP).then(async c => {
      const hit = await c.match(req, { ignoreSearch: url.pathname.endsWith('/') || url.pathname.endsWith('.html') });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  } else if (url.hostname === 'image.tmdb.org') {
    e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); trim(IMG, 600); } return r;
    }));
  } else if (url.hostname === 'api.themoviedb.org') {
    e.respondWith(fetch(req).then(async r => { if (r.ok) { const c = await caches.open(API); c.put(req, r.clone()); trim(API, 800); } return r; })
      .catch(async () => (await caches.open(API)).match(req) || Response.error()));
  }
});

// Mitteilungen antippen → App öffnen
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(l => l[0] ? l[0].focus() : self.clients.openWindow('./'))); });
