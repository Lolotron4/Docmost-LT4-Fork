// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import JSZip from "jszip";
import { generateHTML } from "@tiptap/core";
import { htmlToMarkdown } from "@docmost/editor-ext";
import { save, open } from "@tauri-apps/plugin-dialog";
import { buildExtensions } from "../editor/extensions";
import { base64ToBytes, bytesToBase64, exportWrite, files, importRead } from "./native";
import { createLt4DocsZip, markdownPaths, planImport, readLt4DocsZip, safeFileName, selectForExport } from "./lt4docs";
import { loadDoc, newId } from "./store";
import type { NotebookState, PmDoc } from "./types";

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
    const doc = relinkForMarkdown(await loadDoc(p.id), "../".repeat(depth));
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

export type ExportFormat = "lt4docs" | "markdown";

/** Fragt nach dem Speicherort und schreibt die Datei. Gibt den Pfad zurück oder null (abgebrochen). */
export async function exportToFile(
  state: NotebookState,
  format: ExportFormat,
  spaceIds?: string[],
): Promise<string | null> {
  const single = spaceIds?.length === 1 ? state.spaces.find((s) => s.id === spaceIds[0])?.name : null;
  const base = `${safeFileName(single || "LT4-Docs")}-${dateTag()}`;
  const path = await save({
    title: "Export speichern",
    defaultPath: format === "lt4docs" ? `${base}.lt4docs` : `${base}-markdown.zip`,
    filters:
      format === "lt4docs"
        ? [{ name: "LT4-Docs", extensions: ["lt4docs"] }]
        : [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (!path) return null;
  const bytes =
    format === "lt4docs"
      ? await createLt4DocsZip({ state, spaceIds, loadDoc, loadFile })
      : await buildMarkdownZip(state, spaceIds);
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
