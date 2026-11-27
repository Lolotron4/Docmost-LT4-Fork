// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Service Worker für die PWA (App installieren + Offline-Lesen).
//
// Was er tut:
//   - App-Hülle (index.html) und die gebauten Dateien unter /assets/ zwischenspeichern,
//     damit die App auch ohne Netz startet.
//   - Bilder/Dateien von Seiten (/api/files/...) zusätzlich ablegen, damit sie in
//     offline gespeicherten Seiten sichtbar bleiben.
//   - Alle anderen API-Aufrufe, WebSockets (/socket.io, /collab) gehen immer direkt ans Netz.
//
// Die Seiteninhalte selbst liegen nicht hier, sondern in IndexedDB (lt4/offline/offline-store.ts).

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL_CACHE = `lt4-shell-${VERSION}`;
const ASSET_CACHE = `lt4-assets-${VERSION}`;
const FILE_CACHE = "lt4-files";
const SHELL_URL = "/";
const MAX_FILES = 400;

const STATIC_PREFIXES = ["/assets/", "/icons/", "/locales/"];
const STATIC_FILES = ["/manifest.json", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await cacheShellAndAssets();
      } catch {
        // Ohne Netz beim Installieren bleibt der Offline-Modus eben noch leer.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, FILE_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("lt4-") && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Lädt die App-Hülle und alle darin verlinkten Skripte/Styles. */
async function cacheShellAndAssets() {
  const response = await fetch(SHELL_URL, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) return;
  const html = await response.clone().text();
  const shell = await caches.open(SHELL_CACHE);
  await shell.put(SHELL_URL, response);

  const urls = new Set();
  const re = /(?:src|href)="(\/(?:assets|icons|locales)\/[^"]+)"/g;
  let match;
  while ((match = re.exec(html))) urls.add(match[1]);
  await cacheUrls([...urls]);
}

async function cacheUrls(urls) {
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const u = new URL(url, self.location.origin);
        if (u.origin !== self.location.origin) return;
        if (!STATIC_PREFIXES.some((p) => u.pathname.startsWith(p))) return;
        if (await cache.match(u.pathname)) return;
        const res = await fetch(u.pathname, { credentials: "same-origin" });
        if (res.ok) await cache.put(u.pathname, res);
      } catch {
        // einzelne Datei fehlt: egal
      }
    }),
  );
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "lt4-cache-urls" && Array.isArray(data.urls)) {
    event.waitUntil(cacheUrls(data.urls));
  } else if (data.type === "lt4-cache-files" && Array.isArray(data.urls)) {
    event.waitUntil(cacheFiles(data.urls));
  } else if (data.type === "lt4-clear") {
    // Beim Abmelden: alles Persönliche entfernen (App-Dateien dürfen bleiben).
    event.waitUntil(caches.delete(FILE_CACHE));
  }
});

async function cacheFiles(urls) {
  const cache = await caches.open(FILE_CACHE);
  for (const url of urls.slice(0, 100)) {
    try {
      const u = new URL(url, self.location.origin);
      if (u.origin !== self.location.origin || !u.pathname.startsWith("/api/files/")) continue;
      if (await cache.match(u.href)) continue;
      const res = await fetch(u.href, { credentials: "same-origin" });
      if (res.ok && res.type === "basic") await cache.put(u.href, res);
    } catch {
      // weiter mit der nächsten Datei
    }
  }
  await trimFiles(cache);
}

async function trimFiles(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_FILES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith("/socket.io") || path.startsWith("/collab")) return;

  if (path.startsWith("/api/files/")) {
    event.respondWith(networkFirst(request, FILE_CACHE, true));
    return;
  }
  if (path.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
    return;
  }

  if (path.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (STATIC_PREFIXES.some((p) => path.startsWith(p)) || STATIC_FILES.includes(path)) {
    event.respondWith(networkFirst(request, ASSET_CACHE, false));
  }
});

/** Seitenaufrufe: immer frisch vom Server, ohne Netz die gespeicherte App-Hülle. */
async function navigation(request) {
  const path = new URL(request.url).pathname;
  try {
    const response = await fetch(request);
    // Nur echte App-Seiten als Hülle merken (keine Downloads, keine Fehlerseiten).
    if (
      response.ok &&
      (response.headers.get("content-type") || "").includes("text/html") &&
      !path.startsWith("/share/") &&
      !path.startsWith("/docs")
    ) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const path = new URL(request.url).pathname;
  const cached = await cache.match(path);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(path, response.clone()).catch(() => {});
  return response;
}

async function networkFirst(request, cacheName, isFile) {
  const cache = await caches.open(cacheName);
  const key = isFile ? request.url : new URL(request.url).pathname;
  try {
    const response = await fetch(request);
    // Dateien nur ablegen, wenn eine gespeicherte Seite sie schon angefordert hat
    // (cacheFiles) – sonst wächst der Speicher mit jedem Bild der Wiki-Nutzung.
    if (response.ok && response.type === "basic") {
      if (!isFile || (await cache.match(key))) {
        cache.put(key, response.clone()).catch(() => {});
      }
    }
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}
