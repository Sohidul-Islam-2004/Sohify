/* ==========================================================================
   SOHIFY SERVICE WORKER
   - App pages, CSS and JS: network first, so updates show up right away;
     the cached copy is only used when you're offline.
   - Fonts & icon CSS from CDNs: served from cache, refreshed in the background.
   - Same-origin images: cached, max 300. (Cover art from storage is already
     cached by the browser for a year via its Cache-Control header.)
   - Audio and API calls are never touched (streaming + always-fresh data).
   Bump VERSION to clear old caches after a big change.
   ========================================================================== */
const VERSION = "v1";
const SHELL_CACHE = `sohify-shell-${VERSION}`;
const ASSET_CACHE = `sohify-assets-${VERSION}`;
const IMAGE_CACHE = `sohify-images-${VERSION}`;
const MAX_IMAGES = 300;

const SHELL = ["/", "/Dashboard/", "/Dashboard/style.css", "/Dashboard/script.js", "/Login/", "/Login/style.css", "/Login/script.js", "/favicon.svg"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    const keep = [SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE];
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sohify-") && !keep.includes(k)).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function trimCache(name, max) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = (await cache.match(request, { ignoreSearch: true })) ||
            (request.mode === "navigate" && new URL(request.url).pathname.toLowerCase().startsWith("/dashboard")
                ? await cache.match("/Dashboard/")
                : null);
        if (cached) return cached;
        throw err;
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    const fresh = fetch(request)
        .then((response) => {
            if (response.ok || response.type === "opaque") cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);
    return cached || fresh;
}

async function cacheFirstImage(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).then(() => trimCache(IMAGE_CACHE, MAX_IMAGES));
    return response;
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET" || request.headers.has("range")) return;
    if (request.destination === "audio" || request.destination === "video") return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;
    if (sameOrigin && url.pathname.startsWith("/api/")) return;

    if (sameOrigin && (request.mode === "navigate" || ["script", "style", "manifest"].includes(request.destination))) {
        event.respondWith(networkFirst(request));
    } else if (/fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$/.test(url.hostname)) {
        event.respondWith(staleWhileRevalidate(request));
    } else if (sameOrigin && request.destination === "image") {
        event.respondWith(cacheFirstImage(request));
    }
});
