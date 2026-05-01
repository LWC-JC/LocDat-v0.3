// ===== LocDat service worker =====
const CACHE_VERSION = 'locdat-v036';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './app.js',
  './screens.js',
  './screens2.js',
  './screens3.js',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Don't cache map tiles — they're not in core assets and require network anyway
  if (url.hostname.includes('arcgisonline.com')) return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).then((resp) => {
      if (event.request.method === 'GET' && resp.status === 200 && event.request.url.startsWith('http')) {
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
