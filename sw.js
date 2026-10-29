/* Fichas · para que la app funcione sin conexión una vez abierta.
   - La app (index.html, iconos…): se sirve al instante lo guardado y se actualiza por detrás;
     los cambios se ven la siguiente vez que la abras.
   - Los bancos cifrados (datos/…): primero la red y, sin conexión, lo guardado. Así nunca se queda
     con una versión vieja de un archivo que ha cambiado. */
const CACHE = 'fichas-v2';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const guardar = (req, res) => res.ok ? caches.open(CACHE).then(c => c.put(req, res)) : Promise.resolve();

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/datos/')) {
    e.respondWith(fetch(req).then(res => { e.waitUntil(guardar(req, res.clone())); return res; })
      .catch(() => caches.match(req).then(hit => hit || Response.error())));
    return;
  }
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => {
    const red = fetch(req).then(res => { e.waitUntil(guardar(req, res.clone())); return res; });
    if (!hit) return red;
    e.waitUntil(red.catch(() => {}));
    return hit;
  }));
});
