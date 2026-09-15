// Service worker de SCAR. Cachea solo la aplicación; los datos personales viven en IndexedDB.
const CACHE = 'scar-app-v1';
const ARCHIVOS = ['./','./index.html','./styles.css','./app.js','./manifest.json'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(caches.keys().then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', evento => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(caches.match(evento.request).then(cacheado => cacheado || fetch(evento.request).then(respuesta => {
    const copia = respuesta.clone();
    caches.open(CACHE).then(cache => cache.put(evento.request, copia));
    return respuesta;
  }).catch(() => caches.match('./index.html'))));
});
