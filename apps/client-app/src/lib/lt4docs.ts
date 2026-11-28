// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Format ".lt4docs", Version 1 (siehe docs/lt4/lt4docs-format.md).
 * ZIP mit manifest.json, pages/<id>.json (ProseMirror-JSON) und
 * attachments/<id>/<dateiname>. Der Server liest es mit
 * apps/server/src/lt4/lt4docs-import.
 */
import JSZip from "jszip";
import { APP_VERSION } from "../version";
import { normalizeBase, type LocalBase } from "../base/local-base";
import type {
  AttachmentMeta,
  NotebookState,
  PageMeta,
  PmDoc,
  Space,
} from "./types";

export const LT4DOCS_VERSION = 1;
export const GENERATOR = `LT4-Docs Client ${APP_VERSION}`;

export interface Lt4DocsManifest {
  format: "lt4docs";
  version: number;
  generator: string;
  exportedAt: string;
  spaces: Pick<Space, "id" | "name" | "icon">[];
  pages: Pick<
    PageMeta,
    "id" | "spaceId" | "parentId" | "title" | "icon" | "position" | "createdAt" | "updatedAt" | "isBase"
  >[];
  attachments: (Pick<AttachmentMeta, "id" | "pageId" | "fileName" | "mimeType" | "size"> & {
    path: string;
  })[];
}

/** Dateiname ohne Pfadanteile. */
export function safeFileName(name: string): string {
  const base = String(name ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "datei";
  return cleaned.slice(0, 200);
}

/** Alle Seiten der gewählten Bereiche (oder alle) mit ihren Anhängen. */
export function selectForExport(state: NotebookState, spaceIds?: string[]) {
  const spaces = spaceIds
    ? state.spaces.filter((s) => spaceIds.includes(s.id))
    : state.spaces;
  const ids = new Set(spaces.map((s) => s.id));
  const pages = state.pages.filter((p) => ids.has(p.spaceId));
  const pageIds = new Set(pages.map((p) => p.id));
  const attachments = state.attachments.filter((a) => pageIds.has(a.pageId));
  return { spaces, pages, attachments };
}

export function buildManifest(
  state: NotebookState,
  spaceIds?: string[],
  now = new Date(),
): Lt4DocsManifest {
  const { spaces, pages, attachments } = selectForExport(state, spaceIds);
  return {
    format: "lt4docs",
    version: LT4DOCS_VERSION,
    generator: GENERATOR,
    exportedAt: now.toISOString(),
    spaces: spaces.map(({ id, name, icon }) => ({ id, name, icon: icon ?? null })),
    pages: pages.map(({ id, spaceId, parentId, title, icon, position, createdAt, updatedAt, isBase }) => ({
      id,
      spaceId,
      parentId,
      title,
      icon: icon ?? null,
      position,
      createdAt,
      updatedAt,
      ...(isBase ? { isBase: true } : {}),
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      pageId: a.pageId,
      fileName: safeFileName(a.fileName),
      mimeType: a.mimeType,
      size: a.size,
      path: `attachments/${a.id}/${safeFileName(a.fileName)}`,
    })),
  };
}

export async function createLt4DocsZip(opts: {
  state: NotebookState;
  spaceIds?: string[];
  loadDoc: (pageId: string) => Promise<PmDoc>;
  loadFile: (attachmentId: string) => Promise<Uint8Array | null>;
  loadBase?: (pageId: string) => Promise<LocalBase>;
}): Promise<Uint8Array> {
  const manifest = buildManifest(opts.state, opts.spaceIds);
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const p of manifest.pages) {
    zip.file(`pages/${p.id}.json`, JSON.stringify(await opts.loadDoc(p.id)));
    if (p.isBase && opts.loadBase) {
      const b = await opts.loadBase(p.id);
      zip.file(
        `bases/${p.id}.json`,
        JSON.stringify({ properties: b.properties, views: b.views, rows: b.rows }),
      );
    }
  }
  for (const a of manifest.attachments) {
    const bytes = await opts.loadFile(a.id);
    if (bytes) zip.file(a.path, bytes);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export interface ReadLt4Docs {
  manifest: Lt4DocsManifest;
  docs: Map<string, PmDoc>;
  files: Map<string, Uint8Array>;
  bases: Map<string, LocalBase>;
}

export async function readLt4DocsZip(bytes: Uint8Array): Promise<ReadLt4Docs> {
  const zip = await JSZip.loadAsync(bytes);
  const mf = zip.file("manifest.json");
  if (!mf) throw new Error("Keine LT4-Docs-Datei (manifest.json fehlt).");
  const manifest = JSON.parse(await mf.async("string")) as Lt4DocsManifest;
  if (manifest?.format !== "lt4docs") throw new Error("Keine LT4-Docs-Datei.");
  if (manifest.version > LT4DOCS_VERSION) {
    throw new Error(
      `Die Datei hat Version ${manifest.version}, dieser Client kann bis Version ${LT4DOCS_VERSION}. Bitte den Client aktualisieren.`,
    );
  }
  const docs = new Map<string, PmDoc>();
  for (const p of manifest.pages ?? []) {
    const f = zip.file(`pages/${p.id}.json`);
    if (!f) continue;
    try {
      const json = JSON.parse(await f.async("string"));
      if (json?.type === "doc") docs.set(p.id, json);
    } catch {
      /* kaputte Seite überspringen */
    }
  }
  const files = new Map<string, Uint8Array>();
  for (const a of manifest.attachments ?? []) {
    const f = zip.file(`attachments/${a.id}/${safeFileName(a.fileName)}`);
    if (f) files.set(a.id, await f.async("uint8array"));
  }
  const bases = new Map<string, LocalBase>();
  for (const p of manifest.pages ?? []) {
    if (!p.isBase) continue;
    const f = zip.file(`bases/${p.id}.json`);
    let raw: unknown = null;
    try {
      raw = f ? JSON.parse(await f.async("string")) : null;
    } catch {
      raw = null;
    }
    bases.set(p.id, normalizeBase(raw));
  }
  return { manifest, docs, files, bases };
}

/**
 * Ersetzt Anhang-IDs in einem Dokument (für das Einlesen mit neuen IDs) und
 * passt eingebettete Datenbanken (Knoten "base") an die neuen Seiten-IDs an.
 */
export function remapAttachments(
  doc: PmDoc,
  map: Map<string, { id: string; fileName: string }>,
  pageMap?: Map<string, string>,
): PmDoc {
  const walk = (node: any): any => {
    if (!node || typeof node !== "object") return node;
    const out = { ...node };
    if (node.type === "base" && pageMap && node.attrs?.pageId && pageMap.has(node.attrs.pageId)) {
      out.attrs = { ...node.attrs, pageId: pageMap.get(node.attrs.pageId) };
    }
    if (node.attrs?.attachmentId && map.has(node.attrs.attachmentId)) {
      const ref = map.get(node.attrs.attachmentId)!;
      out.attrs = {
        ...node.attrs,
        attachmentId: ref.id,
        src: localAttachmentSrc(ref.id, ref.fileName),
      };
    }
    if (Array.isArray(node.content)) out.content = node.content.map(walk);
    return out;
  };
  return walk(doc);
}

export function localAttachmentSrc(id: string, fileName: string) {
  return `local-attachment/${id}/${encodeURIComponent(safeFileName(fileName))}`;
}

/**
 * Plant das Einlesen einer .lt4docs-Datei ins lokale Notizbuch: alle Bereiche,
 * Seiten und Anhänge bekommen neue IDs, damit nichts Vorhandenes überschrieben wird.
 */
export function planImport(read: ReadLt4Docs, newId: () => string, now = new Date()) {
  const ts = now.toISOString();
  const spaceMap = new Map<string, string>();
  const pageMap = new Map<string, string>();
  const attMap = new Map<string, { id: string; fileName: string }>();
  const spaces: Space[] = (read.manifest.spaces ?? []).map((s) => {
    const id = newId();
    spaceMap.set(s.id, id);
    return { id, name: s.name || "Bereich", icon: s.icon ?? null, createdAt: ts };
  });
  if (!spaces.length) {
    const id = newId();
    spaces.push({ id, name: "Importiert", icon: null, createdAt: ts });
  }
  for (const p of read.manifest.pages ?? []) pageMap.set(p.id, newId());
  const pages: PageMeta[] = (read.manifest.pages ?? []).map((p) => ({
    id: pageMap.get(p.id)!,
    spaceId: spaceMap.get(p.spaceId) ?? spaces[0].id,
    parentId: p.parentId && pageMap.has(p.parentId) ? pageMap.get(p.parentId)! : null,
    title: p.title || "Unbenannt",
    icon: p.icon ?? null,
    position: Number(p.position) || 0,
    createdAt: p.createdAt || ts,
    updatedAt: p.updatedAt || ts,
    ...(p.isBase ? { isBase: true } : {}),
  }));
  const attachments: AttachmentMeta[] = (read.manifest.attachments ?? [])
    .filter((a) => pageMap.has(a.pageId) && read.files.has(a.id))
    .map((a) => {
      const id = newId();
      attMap.set(a.id, { id, fileName: a.fileName });
      return {
        id,
        pageId: pageMap.get(a.pageId)!,
        fileName: safeFileName(a.fileName),
        mimeType: a.mimeType || "application/octet-stream",
        size: a.size || read.files.get(a.id)!.length,
      };
    });
  const docs = new Map<string, PmDoc>();
  for (const [oldId, doc] of read.docs) {
    const id = pageMap.get(oldId);
    if (id) docs.set(id, remapAttachments(doc, attMap, pageMap));
  }
  const files = new Map<string, Uint8Array>();
  for (const [oldId, ref] of attMap) files.set(ref.id, read.files.get(oldId)!);
  const bases = new Map<string, LocalBase>();
  for (const [oldId, b] of read.bases ?? new Map()) {
    const id = pageMap.get(oldId);
    if (id) bases.set(id, b);
  }
  return { spaces, pages, attachments, docs, files, bases };
}

/** Pfad im Markdown-ZIP: Bereich/Eltern/…/Titel.md (eindeutig gemacht). */
export function markdownPaths(spaces: Space[], pages: PageMeta[]): Map<string, string> {
  const clean = (s: string) =>
    (s || "Unbenannt").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 100) || "Unbenannt";
  const byId = new Map(pages.map((p) => [p.id, p]));
  const spaceName = new Map(spaces.map((s) => [s.id, clean(s.name)]));
  const used = new Set<string>();
  const out = new Map<string, string>();
  const dirOf = (p: PageMeta): string => {
    const parts: string[] = [];
    let cur = p.parentId ? byId.get(p.parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 100) {
      parts.unshift(clean(cur.title));
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return [spaceName.get(p.spaceId) ?? "Bereich", ...parts].join("/");
  };
  for (const p of pages) {
    const dir = dirOf(p);
    let name = `${dir}/${clean(p.title)}.md`;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${dir}/${clean(p.title)} (${n++}).md`;
    used.add(name.toLowerCase());
    out.set(p.id, name);
  }
  return out;
}
