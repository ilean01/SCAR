// Solo recursos de la app: jamás respuestas Auth, API ni fotos personales.
const CACHE = "scar-app-v4.1.0";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./js/core.js",
  "./js/journal.js",
  "./js/db.js",
  "./js/cloud.js",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/ritual.svg",
  "./assets/apple-touch-icon.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];
const allowed = new Set(
  ASSETS.map((p) => new URL(p, self.registration.scope).href),
);
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("scar-app-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (
    req.method !== "GET" ||
    !allowed.has(req.url) ||
    req.headers.has("Authorization")
  )
    return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && r.type === "basic") {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return r;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("Sin conexión", { status: 503 });
      }),
  );
});
