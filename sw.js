/* ============================================================
   sw.js — Service Worker (çevrimdışı destek)
   - Aynı köken uygulama dosyaları: AĞ-ÖNCE (çevrimiçiyken hep güncel,
     çevrimdışında önbellekten; HTML isteği için index.html'e düşer)
   - Çapraz köken (yazı tipleri): bayatla-ve-yenile
   Sürüm yükseltmek için CACHE adını değiştir (örn. v3).
   ============================================================ */
const CACHE = "arnould-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/store.js",
  "./js/timer.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // Aynı köken (uygulama dosyaları): ağ-önce, çevrimdışında önbellek
    e.respondWith(
      fetch(req)
        .then((net) => {
          const copy = net.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return net;
        })
        .catch(() =>
          caches.match(req).then((hit) =>
            hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined)
          )
        )
    );
  } else {
    // Çapraz köken (Google Fonts vb.): bayatla-ve-yenile
    e.respondWith(
      caches.match(req).then((hit) => {
        const fetchPromise = fetch(req)
          .then((net) => {
            const copy = net.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return net;
          })
          .catch(() => hit);
        return hit || fetchPromise;
      })
    );
  }
});
