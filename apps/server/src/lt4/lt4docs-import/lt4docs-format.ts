// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Format ".lt4docs" (Export des LT4-Docs Clients), Version 1.
 *
 * ZIP mit
 *   manifest.json                 – Bereiche, Seitenbaum, Anhänge
 *   pages/<seiten-id>.json        – Seiteninhalt als ProseMirror-JSON (verlustfrei)
 *   attachments/<id>/<dateiname>  – Bilder und Dateien
 *
 * Beschreibung: docs/lt4/lt4docs-format.md
 */
import * as path from 'path';

export const LT4DOCS_FORMAT = 'lt4docs';
export const LT4DOCS_MAX_VERSION = 1;
export const LT4DOCS_MAX_PAGES = 5000;

export interface Lt4DocsSpace {
  id: string;
  name: string;
  icon?: string | null;
}

export interface Lt4DocsPage {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon?: string | null;
  position: number;
}

export interface Lt4DocsAttachment {
  id: string;
  pageId: string;
  fileName: string;
  mimeType?: string;
  size?: number;
}

export interface Lt4DocsManifest {
  format: string;
  version: number;
  spaces: Lt4DocsSpace[];
  pages: Lt4DocsPage[];
  attachments: Lt4DocsAttachment[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Dateiname ohne Pfadanteile und ohne Steuerzeichen. */
export function safeFileName(name: string): string {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'));
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'datei';
  return cleaned.slice(0, 200);
}

/** Prüft und normalisiert manifest.json. Wirft bei ungültigem Inhalt. */
export function parseManifest(raw: string): Lt4DocsManifest {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('manifest.json ist kein gültiges JSON.');
  }
  if (json?.format !== LT4DOCS_FORMAT) {
    throw new Error('Keine LT4-Docs-Datei (manifest.json fehlt oder ist falsch).');
  }
  const version = Number(json.version);
  if (!Number.isInteger(version) || version < 1 || version > LT4DOCS_MAX_VERSION) {
    throw new Error(
      `Diese LT4-Docs-Datei hat Version ${json.version}, der Server kann bis Version ${LT4DOCS_MAX_VERSION}. Bitte LT4-Docs auf dem Server aktualisieren.`,
    );
  }

  const spaces: Lt4DocsSpace[] = (Array.isArray(json.spaces) ? json.spaces : [])
    .filter((s: any) => ID_RE.test(str(s?.id, 64)))
    .map((s: any) => ({
      id: s.id,
      name: str(s.name, 200) || 'Bereich',
      icon: str(s.icon, 50) || null,
    }));
  const spaceIds = new Set(spaces.map((s) => s.id));

  const rawPages = Array.isArray(json.pages) ? json.pages : [];
  if (rawPages.length > LT4DOCS_MAX_PAGES) {
    throw new Error(`Zu viele Seiten (höchstens ${LT4DOCS_MAX_PAGES}).`);
  }
  const pages: Lt4DocsPage[] = rawPages
    .filter((p: any) => ID_RE.test(str(p?.id, 64)))
    .map((p: any, idx: number) => ({
      id: p.id,
      spaceId: spaceIds.has(p.spaceId) ? p.spaceId : spaces[0]?.id ?? '',
      parentId: ID_RE.test(str(p.parentId, 64)) ? p.parentId : null,
      title: str(p.title, 500) || 'Unbenannt',
      icon: str(p.icon, 50) || null,
      position: Number.isFinite(Number(p.position)) ? Number(p.position) : idx,
    }));

  // Eltern, die nicht existieren oder Zyklen bilden, werden entfernt.
  const byId = new Map(pages.map((p) => [p.id, p]));
  for (const p of pages) {
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    if (!parent || parent.spaceId !== p.spaceId) {
      p.parentId = null;
      continue;
    }
    const seen = new Set<string>([p.id]);
    let cur: Lt4DocsPage | undefined = parent;
    while (cur) {
      if (seen.has(cur.id)) {
        p.parentId = null;
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }

  const pageIds = new Set(pages.map((p) => p.id));
  const attachments: Lt4DocsAttachment[] = (
    Array.isArray(json.attachments) ? json.attachments : []
  )
    .filter((a: any) => ID_RE.test(str(a?.id, 64)) && pageIds.has(a?.pageId))
    .map((a: any) => ({
      id: a.id,
      pageId: a.pageId,
      fileName: safeFileName(a.fileName),
      mimeType: str(a.mimeType, 100) || undefined,
      size: Number(a.size) || undefined,
    }));

  return { format: LT4DOCS_FORMAT, version, spaces, pages, attachments };
}

/** Pfad einer Datei im entpackten Export; null, wenn er aus dem Ordner herausführen würde. */
export function resolveInside(extractDir: string, ...parts: string[]): string | null {
  const root = path.resolve(extractDir);
  const full = path.resolve(root, ...parts);
  return full.startsWith(root + path.sep) ? full : null;
}

/** Seiten so sortieren, dass Eltern immer vor ihren Kindern kommen. */
export function orderParentsFirst<T extends { id: string; parentId: string | null }>(
  pages: T[],
): T[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const depth = (p: T) => {
    let d = 0;
    let cur = p.parentId ? byId.get(p.parentId) : undefined;
    while (cur && d < 1000) {
      d++;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return d;
  };
  return pages
    .map((p, i) => ({ p, d: depth(p), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.p);
}

export interface NewAttachmentRef {
  id: string;
  fileName: string;
}

/**
 * Ersetzt in einem ProseMirror-Dokument alle Verweise auf exportierte Anhänge
 * (attrs.attachmentId) durch die neu angelegten Anhänge auf dem Server.
 * Unbekannte lokale Verweise (z. B. "local-attachment/…") werden geleert.
 */
export function rewriteAttachmentRefs(
  doc: any,
  map: Map<string, NewAttachmentRef>,
): any {
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    const out: any = { ...node };
    if (node.attrs && typeof node.attrs === 'object') {
      const attrs = { ...node.attrs };
      const ref = attrs.attachmentId ? map.get(attrs.attachmentId) : undefined;
      if (ref) {
        const url = `/api/files/${ref.id}/${encodeURIComponent(ref.fileName)}`;
        attrs.attachmentId = ref.id;
        if ('src' in attrs) attrs.src = url;
        if ('url' in attrs) attrs.url = url;
      } else {
        for (const key of ['src', 'url']) {
          if (typeof attrs[key] === 'string' && attrs[key].startsWith('local-attachment/')) {
            attrs[key] = '';
          }
        }
      }
      out.attrs = attrs;
    }
    if (Array.isArray(node.content)) out.content = node.content.map(walk);
    return out;
  };
  return walk(doc);
}
