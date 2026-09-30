/* OKABE POS service worker: halaman kasir & aset statis tetap tersedia saat offline (POS-01). */
const PAGE_CACHE = "okabe-pos-pages-v1";
const ASSET_CACHE = "okabe-pos-assets-v1";
const OFFLINE_PAGES = ["/pos", "/pos/checker"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![PAGE_CACHE, ASSET_CACHE].includes(k)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Aset build Next.js bersifat immutable: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Halaman kasir: network-first, fallback ke salinan terakhir saat offline.
  if (req.mode === "navigate" && OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) ?? Response.error()),
    );
  }
});
