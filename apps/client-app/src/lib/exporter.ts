// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import JSZip from "jszip";
import { generateHTML } from "@tiptap/core";
import { htmlToMarkdown } from "@docmost/editor-ext";
import { decorateForPrint } from "./print-decorate";
import { save, open } from "@tauri-apps/plugin-dialog";
import { buildExtensions } from "../editor/extensions";
import { base64ToBytes, bytesToBase64, exportWrite, files, importRead, printPage } from "./native";
import { buildDocx, buildXlsx, collectSheets, combineDocs, pagesInTreeOrder } from "./office-export";
import { createLt4DocsZip, markdownPaths, planImport, readLt4DocsZip, safeFileName, selectForExport } from "./lt4docs";
import { descendants, loadDoc, newId } from "./store";
import type { NotebookState, PageMeta, PmDoc } from "./types";
import { readBase } from "../base/local-base";
import { baseToDoc } from "../base/base-export";

/** Inhalt einer Seite; Datenbanken als Tabelle. */
const loadContent = async (p: PageMeta): Promise<PmDoc> => (p.isBase ? baseToDoc(await readBase(p.id)) : loadDoc(p.id));

const loadFile = async (id: string) => {
  const b64 = await files.read(id);
  return b64 ? base64ToBytes(b64) : null;
};

const dateTag = () => new Date().toISOString().slice(0, 10);

/** Ersetzt lokale Bildverweise durch relative Pfade im Markdown-ZIP. */
function relinkForMarkdown(doc: PmDoc, prefix: string): PmDoc {
  const walk = (n: any): any => {
    if (!n || typeof n !== "object") return n;
    const out = { ...n };
    if (n.attrs?.attachmentId && typeof n.attrs.src === "string" && n.attrs.src.startsWith("local-attachment/")) {
      const name = decodeURIComponent(n.attrs.src.split("/").pop() || "datei");
      out.attrs = { ...n.attrs, src: `${prefix}_anhaenge/${n.attrs.attachmentId}/${encodeURIComponent(safeFileName(name))}` };
    }
    if (Array.isArray(n.content)) out.content = n.content.map(walk);
    return out;
  };
  return walk(doc);
}

export async function buildMarkdownZip(state: NotebookState, spaceIds?: string[]) {
  const { spaces, pages, attachments } = selectForExport(state, spaceIds);
  const paths = markdownPaths(spaces, pages);
  const zip = new JSZip();
  const ext = buildExtensions();
  for (const p of pages) {
    const path = paths.get(p.id)!;
    const depth = path.split("/").length - 1;
    const doc = relinkForMarkdown(await loadContent(p), "../".repeat(depth));
    let md = "";
    try {
      md = htmlToMarkdown(generateHTML(doc as any, ext));
    } catch (e) {
      md = `> Seite konnte nicht umgewandelt werden: ${String(e)}`;
    }
    zip.file(path, `# ${p.title || "Unbenannt"}\n\n${md}\n`);
  }
  for (const a of attachments) {
    const bytes = await loadFile(a.id);
    if (bytes) zip.file(`_anhaenge/${a.id}/${safeFileName(a.fileName)}`, bytes);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export type ExportFormat = "lt4docs" | "markdown" | "docx" | "xlsx" | "pdf";

/** Was exportiert wird: ganze Bereiche oder nur eine Seite (optional mit Unterseiten). */
export type ExportScope =
  | { kind: "spaces"; spaceIds: string[] }
  | { kind: "page"; pageId: string; withChildren: boolean };

export class NothingToExportError extends Error {}

const FORMAT_FILE: Record<Exclude<ExportFormat, "pdf">, { ext: string; name: string; suffix: string }> = {
  lt4docs: { ext: "lt4docs", name: "LT4-Docs", suffix: "" },
  markdown: { ext: "zip", name: "ZIP", suffix: "-markdown" },
  docx: { ext: "docx", name: "Word", suffix: "" },
  xlsx: { ext: "xlsx", name: "Excel", suffix: "-tabellen" },
};

/** Seiten im Umfang, in Baum-Reihenfolge. */
export function pagesForScope(state: NotebookState, scope: ExportScope): PageMeta[] {
  if (scope.kind === "spaces") return pagesInTreeOrder(state, scope.spaceIds);
  const page = state.pages.find((p) => p.id === scope.pageId);
  if (!page) return [];
  if (!scope.withChildren) return [page];
  const all = pagesInTreeOrder(state, [page.spaceId]);
  const keep = new Set([page.id, ...descendants(state.pages, page.id)]);
  return all.filter((p) => keep.has(p.id));
}

async function loadEntries(pages: PageMeta[]) {
  const out: { title: string; doc: PmDoc }[] = [];
  for (const p of pages) out.push({ title: p.title || "Unbenannt", doc: await loadContent(p) });
  return out;
}

function scopeBaseName(state: NotebookState, scope: ExportScope): string {
  let name: string | undefined;
  if (scope.kind === "page") name = state.pages.find((p) => p.id === scope.pageId)?.title;
  else if (scope.spaceIds.length === 1) name = state.spaces.find((s) => s.id === scope.spaceIds[0])?.name;
  return `${safeFileName(name || "LT4-Docs")}-${dateTag()}`;
}

/** Lokale Bilder als data:-URL einbetten, damit sie im Druck/PDF erscheinen. */
async function inlineImages(doc: PmDoc): Promise<PmDoc> {
  const walk = async (n: any): Promise<any> => {
    if (!n || typeof n !== "object") return n;
    const out = { ...n };
    if (n.attrs?.attachmentId && typeof n.attrs.src === "string" && n.attrs.src.startsWith("local-attachment/")) {
      const b64 = await files.read(n.attrs.attachmentId);
      const mime = n.attrs.mime || (/\.png$/i.test(n.attrs.src) ? "image/png" : /\.gif$/i.test(n.attrs.src) ? "image/gif" : /\.webp$/i.test(n.attrs.src) ? "image/webp" : /\.svg$/i.test(n.attrs.src) ? "image/svg+xml" : "image/jpeg");
      if (b64) out.attrs = { ...n.attrs, src: `data:${mime};base64,${b64}` };
    }
    if (Array.isArray(n.content)) out.content = await Promise.all(n.content.map(walk));
    return out;
  };
  return walk(doc);
}

/** PDF: Seiten als sauberes HTML in einen Druckbereich legen und den Druckdialog öffnen. */
async function printAsPdf(state: NotebookState, scope: ExportScope): Promise<void> {
  const entries = await loadEntries(pagesForScope(state, scope));
  if (!entries.length) throw new NothingToExportError("Keine Seiten zum Exportieren.");
  const html = generateHTML((await inlineImages(combineDocs(entries))) as any, buildExtensions());
  let root = document.getElementById("lt4-print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "lt4-print-root";
    root.className = "lt4-prose";
    document.body.appendChild(root);
  }
  root.innerHTML = html;
  decorateForPrint(root);
  const prevTitle = document.title;
  document.title = scopeBaseName(state, scope);
  // Bilder fertig laden lassen, sonst fehlen sie im PDF.
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((img) =>
      img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))),
    ),
  );
  const cleanup = () => {
    root?.remove();
    document.title = prevTitle;
  };
  try {
    await printPage();
  } catch {
    window.print();
  }
  // Der Druckdialog läuft je nach System asynchron; Inhalt erst nach dem Schließen entfernen.
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => window.addEventListener("focus", cleanup, { once: true }), 1000);
}

/**
 * Exportiert im gewählten Format. Gibt den gespeicherten Pfad zurück, "printed" bei PDF
 * (Druckdialog) oder null, wenn der Speicherdialog abgebrochen wurde.
 */
export async function exportToFile(
  state: NotebookState,
  format: ExportFormat,
  scopeOrSpaceIds?: ExportScope | string[],
): Promise<string | null> {
  let scope: ExportScope;
  if (Array.isArray(scopeOrSpaceIds)) scope = { kind: "spaces", spaceIds: scopeOrSpaceIds };
  else scope = scopeOrSpaceIds ?? { kind: "spaces", spaceIds: state.spaces.map((s) => s.id) };
  if (format === "pdf") {
    await printAsPdf(state, scope);
    return "printed";
  }

  // Inhalte vor dem Speicherdialog prüfen, damit niemand umsonst einen Ort wählt.
  let entries: { title: string; doc: PmDoc }[] = [];
  if (format === "docx" || format === "xlsx") {
    entries = await loadEntries(pagesForScope(state, scope));
    if (!entries.length) throw new NothingToExportError("Keine Seiten zum Exportieren.");
  }
  const sheets = format === "xlsx" ? collectSheets(entries) : [];
  if (format === "xlsx" && !sheets.length) {
    throw new NothingToExportError("In den gewählten Seiten gibt es keine Tabellen.");
  }

  const f = FORMAT_FILE[format];
  const path = await save({
    title: "Export speichern",
    defaultPath: `${scopeBaseName(state, scope)}${f.suffix}.${f.ext}`,
    filters: [{ name: f.name, extensions: [f.ext] }],
  });
  if (!path) return null;

  const spaceIds = scope.kind === "spaces"
    ? scope.spaceIds
    : [state.pages.find((p) => p.id === scope.pageId)?.spaceId ?? ""];
  let bytes: Uint8Array;
  if (format === "docx") bytes = await buildDocx(combineDocs(entries), loadFile);
  else if (format === "xlsx") bytes = await buildXlsx(sheets);
  else if (format === "lt4docs") bytes = await createLt4DocsZip({ state, spaceIds, loadDoc, loadFile, loadBase: readBase });
  else bytes = await buildMarkdownZip(state, spaceIds);
  await exportWrite(path, bytesToBase64(bytes));
  return path;
}

/** Datei wählen und als neue Bereiche ins lokale Notizbuch einlesen. */
export async function pickAndReadLt4Docs() {
  const path = await open({
    title: "LT4-Docs-Datei einlesen",
    multiple: false,
    filters: [{ name: "LT4-Docs", extensions: ["lt4docs", "zip"] }],
  });
  if (!path || Array.isArray(path)) return null;
  const read = await readLt4DocsZip(base64ToBytes(await importRead(path)));
  return planImport(read, newId);
}
