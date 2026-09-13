// footballclub.wiki service worker: offline page, images and last data snapshot.
//
// Bump VERSION when the SHELL or LIBS lists change (e.g. a library upgrade in index.html).
// The page and data are network-first, so ordinary content edits need no bump.

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;   // page, icons, manifest
const LIBS = `libs-${VERSION}`;     // cdnjs libraries and Google Fonts
const DATA = 'data';                // last good copy of data/*.json
const IMAGES = 'images';            // crests and ground photos
const KEEP = [SHELL, LIBS, DATA, IMAGES];

const SHELL_URLS = [
  '/', '/favicon.svg', '/logo-mark.svg', '/manifest.webmanifest', '/apple-touch-icon.png',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
];
const DATA_URLS = ['clubs', 'snapshot', 'rosters', 'flags', 'world'].map(f => `/data/${f}.json`);
const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.0/maplibre-gl.css',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.0/maplibre-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Third-party files: prefer a CORS response, fall back to an opaque one.
const fetchLib = url => fetch(url, { mode: 'cors' }).catch(() => fetch(url, { mode: 'no-cors' }));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(SHELL_URLS);
    await (await caches.open(DATA)).addAll(DATA_URLS);
    const libs = await caches.open(LIBS);
    await Promise.allSettled(LIB_URLS.map(u => fetchLib(u).then(r => libs.put(u, r))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
    await self.clients.claim();
    warmImages(); // not awaited: fills the image cache in the background
  })());
});

// Download every crest, and every ground photo unless the user has Save-Data on
// (then photos are cached as they're viewed). Already-cached files are skipped.
async function warmImages() {
  try {
    const res = await caches.match('/data/clubs.json') || await fetch('/data/clubs.json');
    const { clubs } = await res.clone().json();
    const saveData = self.navigator.connection && self.navigator.connection.saveData;
    const urls = clubs.flatMap(c => [
      `/img/crests/${c.espn_id}.png`,
      ...(c.has_photo && !saveData ? [`/img/grounds/${c.espn_id}.jpg`] : []),
    ]);
    const cache = await caches.open(IMAGES);
    for (let i = 0; i < urls.length; i += 8) {
      await Promise.allSettled(urls.slice(i, i + 8).map(async u => {
        if (await cache.match(u)) return;
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      }));
    }
  } catch (e) { /* offline or quota: images will be cached as they're viewed */ }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') return event.respondWith(networkFirst(req, SHELL, '/'));
    if (url.pathname.startsWith('/data/')) return event.respondWith(networkFirst(req, DATA));
    if (url.pathname.startsWith('/img/')) return event.respondWith(staleWhileRevalidate(req, IMAGES));
    if (SHELL_URLS.includes(url.pathname)) return event.respondWith(cacheFirst(req, SHELL));
    return; // anything else (sw.js, robots.txt, …) goes straight to the network
  }
  if (LIB_HOSTS.includes(url.hostname)) return event.respondWith(cacheFirst(req, LIBS));
  // ESPN live data and map tiles pass through; the page falls back to the snapshot / canvas globe.
});

async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  const key = fallbackKey || new URL(req.url).pathname; // ignore cache-busting query strings
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const key = new URL(req.url).pathname;
  const hit = await cache.match(key);
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(key, res.clone()); return res; });
  if (hit) { fresh.catch(() => {}); return hit; }
  return fresh;
}
