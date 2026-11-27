// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Offline-Speicher für Seiten (IndexedDB "lt4-offline").
 *
 * Zwei Arten von Einträgen pro Person:
 *   - zuletzt besuchte Seiten (automatisch, höchstens RECENT_LIMIT, älteste fliegen raus)
 *   - markierte Seiten ("Offline verfügbar", bleiben bis zum Entfernen)
 *
 * Gespeichert wird nur, was die Person ohnehin lesen darf (Inhalt aus /pages/info).
 * Beim Abmelden wird alles gelöscht (clearOfflineData).
 */

export const RECENT_LIMIT = 30;
const DB_NAME = "lt4-offline";
const STORE = "pages";
const CHANGED_EVENT = "lt4-offline-changed";
const AUTO_SAVE_KEY = "lt4-offline-auto";

export interface OfflinePage {
  key: string;
  userId: string;
  pageId: string;
  slugId: string;
  title: string;
  icon?: string | null;
  spaceSlug?: string | null;
  spaceName?: string | null;
  content: any;
  pageUpdatedAt?: string | null;
  savedAt: number;
  lastViewedAt: number;
  pinned: boolean;
}

/** Was wir von einer Seite brauchen (Teilmenge von IPage). */
export interface OfflinePageSource {
  id: string;
  slugId: string;
  title?: string | null;
  icon?: string | null;
  content?: any;
  updatedAt?: string | Date | null;
  isBase?: boolean;
  deletedAt?: string | Date | null;
  space?: { slug?: string; name?: string } | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nicht verfügbar"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Beim Löschen der Datenbank (Abmelden in anderem Tab) Verbindung freigeben.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(STORE, mode);
  const store = transaction.objectStore(STORE);
  const result = await fn(store);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return result;
}

function notifyChanged() {
  try {
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function onOfflineChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, cb);
  return () => window.removeEventListener(CHANGED_EVENT, cb);
}

const keyOf = (userId: string, pageId: string) => `${userId}:${pageId}`;

export function canStoreOffline(page?: OfflinePageSource | null): boolean {
  return !!page && !page.isBase && !page.deletedAt && page.content != null;
}

export function isAutoSaveEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoSaveEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export async function listOfflinePages(userId: string): Promise<OfflinePage[]> {
  if (!userId) return [];
  try {
    const items = await tx("readonly", (store) =>
      done(store.index("userId").getAll(userId) as IDBRequest<OfflinePage[]>),
    );
    return items.sort((a, b) => b.lastViewedAt - a.lastViewedAt);
  } catch {
    return [];
  }
}

/** Sucht nach Seiten-ID oder slugId. */
export async function getOfflinePage(
  userId: string,
  idOrSlug: string,
): Promise<OfflinePage | null> {
  if (!userId || !idOrSlug) return null;
  try {
    const direct = await tx("readonly", (store) =>
      done(store.get(keyOf(userId, idOrSlug)) as IDBRequest<OfflinePage | undefined>),
    );
    if (direct) return direct;
    const all = await listOfflinePages(userId);
    return all.find((p) => p.slugId === idOrSlug) ?? null;
  } catch {
    return null;
  }
}

/**
 * Legt eine Seite ab oder aktualisiert sie.
 * pinned: undefined = Markierung beibehalten; true/false = setzen.
 * Ohne Markierung wird nur gespeichert, wenn automatisches Speichern an ist.
 */
export async function saveOfflinePage(
  userId: string,
  page: OfflinePageSource,
  opts: { pinned?: boolean; viewed?: boolean } = {},
): Promise<OfflinePage | null> {
  if (!userId || !canStoreOffline(page)) return null;
  try {
    const key = keyOf(userId, page.id);
    const existing = await tx("readonly", (store) =>
      done(store.get(key) as IDBRequest<OfflinePage | undefined>),
    );
    const pinned = opts.pinned ?? existing?.pinned ?? false;
    if (!pinned && !existing && !isAutoSaveEnabled()) return null;
    const now = Date.now();
    const record: OfflinePage = {
      key,
      userId,
      pageId: page.id,
      slugId: page.slugId,
      title: page.title ?? "",
      icon: page.icon ?? null,
      spaceSlug: page.space?.slug ?? existing?.spaceSlug ?? null,
      spaceName: page.space?.name ?? existing?.spaceName ?? null,
      content: page.content,
      pageUpdatedAt: page.updatedAt ? new Date(page.updatedAt).toISOString() : null,
      savedAt: now,
      lastViewedAt: opts.viewed === false && existing ? existing.lastViewedAt : now,
      pinned,
    };
    await tx("readwrite", (store) => done(store.put(record)));
    if (!pinned) await trimRecent(userId);
    cacheFilesOf(record.content);
    notifyChanged();
    return record;
  } catch {
    return null;
  }
}

export async function setOfflinePinned(
  userId: string,
  page: OfflinePageSource,
  pinned: boolean,
): Promise<void> {
  if (pinned) {
    await saveOfflinePage(userId, page, { pinned: true, viewed: false });
    // Browser bitten, den Speicher nicht automatisch zu leeren.
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
    return;
  }
  // Markierung entfernen: Seite bleibt als "zuletzt besucht", falls automatisch an.
  if (isAutoSaveEnabled()) {
    await saveOfflinePage(userId, page, { pinned: false, viewed: false });
  } else {
    await removeOfflinePage(userId, page.id);
  }
}

export async function removeOfflinePage(userId: string, pageId: string) {
  try {
    await tx("readwrite", (store) => done(store.delete(keyOf(userId, pageId))));
    notifyChanged();
  } catch {
    /* ignore */
  }
}

/** Entfernt alle nicht markierten Seiten einer Person. */
export async function clearRecentPages(userId: string) {
  const all = await listOfflinePages(userId);
  try {
    await tx("readwrite", async (store) => {
      for (const p of all) if (!p.pinned) store.delete(p.key);
    });
  } catch {
    /* ignore */
  }
  notifyChanged();
}

async function trimRecent(userId: string) {
  const all = await listOfflinePages(userId);
  const recent = all.filter((p) => !p.pinned);
  if (recent.length <= RECENT_LIMIT) return;
  const drop = recent.slice(RECENT_LIMIT);
  await tx("readwrite", async (store) => {
    for (const p of drop) store.delete(p.key);
  });
}

/** Beim Abmelden: Seiten und gespeicherte Dateien löschen. */
export async function clearOfflineData(): Promise<void> {
  try {
    const db = await dbPromise?.catch(() => null);
    db?.close();
    dbPromise = null;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  } catch {
    /* Abmelden darf daran nie scheitern */
  }
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "lt4-clear" });
    await caches?.delete?.("lt4-files");
  } catch {
    /* ignore */
  }
}

/** Sammelt /api/files/...-Verweise (Bilder, Anhänge, Zeichnungen) aus dem Inhalt. */
export function collectFileUrls(content: any, out = new Set<string>()): Set<string> {
  if (!content || typeof content !== "object") return out;
  if (Array.isArray(content)) {
    for (const item of content) collectFileUrls(item, out);
    return out;
  }
  const attrs = content.attrs;
  if (attrs && typeof attrs === "object") {
    for (const value of Object.values(attrs)) {
      if (typeof value === "string" && value.startsWith("/api/files/")) out.add(value);
    }
  }
  if (Array.isArray(content.content)) collectFileUrls(content.content, out);
  return out;
}

function cacheFilesOf(content: any) {
  try {
    const urls = [...collectFileUrls(content)].map((u) => new URL(u, location.origin).href);
    if (!urls.length) return;
    navigator.serviceWorker?.controller?.postMessage({ type: "lt4-cache-files", urls });
  } catch {
    /* ignore */
  }
}

/** Person aus der letzten Sitzung (funktioniert auch offline). */
export function getStoredUserId(): string | null {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return null;
    return JSON.parse(raw)?.user?.id ?? null;
  } catch {
    return null;
  }
}
