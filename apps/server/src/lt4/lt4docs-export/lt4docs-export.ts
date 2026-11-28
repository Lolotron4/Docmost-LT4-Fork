// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Export als ".lt4docs" (Format Version 1, siehe docs/lt4/lt4docs-format.md).
 * Gleiches Format wie der Export des LT4-Docs Clients: lässt sich im Client
 * ("Datei einlesen") und auf jedem LT4-Server ("Seiten importieren › LT4-Docs") einlesen.
 */
import * as JSZip from 'jszip';
import { getAttachmentIds } from '../../common/helpers/prosemirror/utils';
import { LT4DOCS_FORMAT, safeFileName } from '../lt4docs-import/lt4docs-format';

export const LT4DOCS_EXPORT_VERSION = 1;

export interface Lt4DocsExportPage {
  id: string;
  spaceId: string;
  parentPageId: string | null;
  title: string | null;
  icon: string | null;
  position: string | null;
  content: unknown;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  isBase?: boolean;
}

/** Datenbank-Inhalt einer Seite (Eigenschaften, Ansichten, Zeilen). */
export interface Lt4DocsExportBase {
  properties: unknown[];
  views: unknown[];
  rows: unknown[];
}

export interface Lt4DocsExportAttachment {
  id: string;
  fileName: string;
  filePath: string;
  pageId?: string | null;
  mimeType?: string | null;
  fileSize?: number | string | null;
}

const iso = (v: Date | string | null | undefined) =>
  v ? new Date(v as any).toISOString() : undefined;

const parseContent = (content: unknown): any => {
  if (!content) return { type: 'doc', content: [{ type: 'paragraph' }] };
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return { type: 'doc', content: [{ type: 'paragraph' }] };
    }
  }
  return content;
};

/** Docmost-Positionen sind Bruchindizes (Text); im Format stehen ganze Zahlen je Geschwisterebene. */
export function numericPositions(pages: Lt4DocsExportPage[]): Map<string, number> {
  const groups = new Map<string, Lt4DocsExportPage[]>();
  for (const p of pages) {
    const key = `${p.spaceId}:${p.parentPageId ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const out = new Map<string, number>();
  for (const list of groups.values()) {
    list
      .slice()
      .sort((a, b) => {
        const pa = a.position ?? '';
        const pb = b.position ?? '';
        if (pa === pb) return (a.title ?? '').localeCompare(b.title ?? '');
        return pa < pb ? -1 : 1; // Bruchindizes sind byteweise sortiert
      })
      .forEach((p, i) => out.set(p.id, i));
  }
  return out;
}

export async function buildLt4DocsZip(opts: {
  space: { id: string; name: string; icon?: string | null };
  pages: Lt4DocsExportPage[];
  /** Anhänge, die der Nutzer sehen darf (nach ID). */
  attachments: Map<string, Lt4DocsExportAttachment>;
  readFile: (filePath: string) => Promise<Buffer>;
  /** Datenbank-Daten für Seiten mit isBase. */
  loadBase?: (pageId: string) => Promise<Lt4DocsExportBase>;
  generator: string;
  now?: Date;
}): Promise<NodeJS.ReadableStream> {
  const { space, pages, attachments } = opts;
  const pageIds = new Set(pages.map((p) => p.id));
  const positions = numericPositions(pages);
  const zip = new JSZip();

  const usedAttachments: (Lt4DocsExportAttachment & { forPage: string })[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const doc = parseContent(p.content);
    zip.file(`pages/${p.id}.json`, JSON.stringify(doc));
    if (p.isBase && opts.loadBase) {
      zip.file(`bases/${p.id}.json`, JSON.stringify(await opts.loadBase(p.id)));
    }
    for (const id of getAttachmentIds(doc)) {
      const a = attachments.get(id);
      if (!a || seen.has(id)) continue;
      seen.add(id);
      usedAttachments.push({ ...a, forPage: p.id });
    }
  }

  const manifestAttachments = [];
  for (const a of usedAttachments) {
    const name = safeFileName(a.fileName);
    const filePath = `attachments/${a.id}/${name}`;
    try {
      zip.file(filePath, await opts.readFile(a.filePath));
    } catch {
      continue; // fehlende Datei im Speicher: Anhang weglassen
    }
    manifestAttachments.push({
      id: a.id,
      pageId: a.forPage,
      fileName: name,
      mimeType: a.mimeType ?? undefined,
      size: a.fileSize != null ? Number(a.fileSize) : undefined,
      path: filePath,
    });
  }

  const manifest = {
    format: LT4DOCS_FORMAT,
    version: LT4DOCS_EXPORT_VERSION,
    generator: opts.generator,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    spaces: [{ id: space.id, name: space.name, icon: space.icon ?? null }],
    pages: pages.map((p) => ({
      id: p.id,
      spaceId: space.id,
      parentId: p.parentPageId && pageIds.has(p.parentPageId) ? p.parentPageId : null,
      title: p.title || 'Unbenannt',
      icon: p.icon ?? null,
      position: positions.get(p.id) ?? 0,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
      ...(p.isBase ? { isBase: true } : {}),
    })),
    attachments: manifestAttachments,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateNodeStream({
    type: 'nodebuffer',
    streamFiles: true,
    compression: 'DEFLATE',
  });
}
