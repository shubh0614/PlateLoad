// Offline support. Cache first so the app opens instantly with no signal,
// then refresh the cache in the background so updates arrive on the next open.
// Also clears the old Anchor app's caches (anchor-v*) so it can't serve stale files.
const CACHE = "anchor7-v3";
const SHELL = ["./", "./index.html", "./app.js", "./logic.js", "./plan.js", "./store.js", "./styles.css", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png", "./fonts/archivo.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith("anchor7-") && k !== CACHE) || /^anchor-v\d+$/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    const network = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
    return Response.error();
  }));
});
