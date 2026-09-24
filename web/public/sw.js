const CACHE = "onlyhand-shell-v2";
const scope = self.registration.scope;
const shell = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./icon-192.png",
  "./manifest.webmanifest",
  "./demo.webp",
].map((path) => new URL(path, scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    const responses = await Promise.allSettled(shell.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    }));
    return responses;
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;

  const remember = (key, response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, copy)).catch(() => {}));
    }
    return response;
  };

  if (request.mode === "navigate") {
    const index = new URL("./index.html", scope).href;
    event.respondWith(fetch(request)
      .then((response) => remember(index, response))
      .catch(() => caches.match(index)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => remember(request, response));
    if (!cached) return network;
    event.waitUntil(network.catch(() => {}));
    return cached;
  }));
});
