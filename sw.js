/* ============================================================
   sw.js — Service Worker (çevrimdışı + güvenilir otomatik güncelleme)
   - Aynı köken uygulama dosyaları: AĞ-ÖNCE, ağ isteği HTTP önbelleğini
     ATLAR (cache:"reload") → çevrimiçiyken her zaman en güncel bayt.
   - Çevrimdışında önbellekten; HTML isteği index.html'e düşer.
   - Çapraz köken: yalnızca fonts/gstatic bayatla-ve-yenile; Firebase/Google
     API çağrıları SW'ye dokunmaz.
   - skipWaiting + SKIP_WAITING mesajı + clients.claim ile yeni sürüm anında
     devreye girer; sayfa tarafı controllerchange'de bir kez yeniden yüklenir.
   Sürüm yükseltmek için CACHE adını değiştir.
   ============================================================ */
const CACHE = "arnould-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/store.js",
  "./js/timer.js",
  "./js/ui.js",
  "./js/app.js",
  "./js/sync.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Tek bir varlık 404 olsa bile kurulum çökmesin (yoksa eski SW'de takılı kalınır)
    await Promise.allSettled(ASSETS.map((u) => c.add(u)));
    await self.skipWaiting();
  })());
});

// Sayfa "yeni sürümü hemen devreye al" derse
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // Aynı köken: ağ-önce ama ağ isteği HTTP önbelleğini atlar (bayat HTML/JS önlenir)
    e.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: "reload" });
        e.waitUntil(caches.open(CACHE).then((c) => c.put(req, net.clone())));
        return net;
      } catch (err) {
        const hit = await caches.match(req);
        return hit || (req.mode === "navigate" ? await caches.match("./index.html") : Response.error());
      }
    })());
    return;
  }

  // Çapraz köken: yalnızca yazı tipleri / gstatic önbelleğe (Firebase API'leri hariç)
  const cacheable = url.host === "fonts.googleapis.com" || url.host.endsWith(".gstatic.com");
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetchPromise = fetch(req)
        .then((net) => {
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, net.clone())));
          return net;
        })
        .catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
