// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Export als Word (.docx), Excel (.xlsx, alle Tabellen) und PDF (über den Druckdialog).
import JSZip from "jszip";
import { getSchema } from "@tiptap/core";
import { Node as PmNode } from "@tiptap/pm/model";
import { Packer } from "docx";
import { pageNodeToDocxDocument } from "@docmost/editor-ext";
import { buildExtensions } from "../editor/extensions";
import { childrenOf } from "./store";
import type { NotebookState, PageMeta, PmDoc } from "./types";

/** Seiten der Bereiche in Baum-Reihenfolge (Eltern vor Kindern, Geschwister nach Position). */
export function pagesInTreeOrder(state: NotebookState, spaceIds: string[]): PageMeta[] {
  const out: PageMeta[] = [];
  const walk = (spaceId: string, parentId: string | null, depth: number) => {
    if (depth > 100) return;
    for (const p of childrenOf(state.pages, spaceId, parentId)) {
      out.push(p);
      walk(spaceId, p.id, depth + 1);
    }
  };
  for (const s of state.spaces) if (spaceIds.includes(s.id)) walk(s.id, null, 0);
  return out;
}

/** Fügt mehrere Seiten zu einem Dokument zusammen, jede beginnt mit ihrem Titel als Überschrift. */
export function combineDocs(entries: { title: string; doc: PmDoc }[]): PmDoc {
  const content: any[] = [];
  for (const e of entries) {
    content.push({
      type: "heading",
      attrs: { level: 1 },
      content: e.title.trim() ? [{ type: "text", text: e.title.trim() }] : undefined,
    });
    const body = Array.isArray(e.doc?.content) ? e.doc.content : [];
    content.push(...(body.length ? body : [{ type: "paragraph" }]));
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** ID eines lokalen Anhangs aus src ("local-attachment/<id>/<name>"). */
export function attachmentIdFromSrc(src: string): string | null {
  const m = /^local-attachment\/([A-Za-z0-9_-]+)\//.exec(String(src ?? ""));
  return m ? m[1] : null;
}

export async function buildDocx(
  doc: PmDoc,
  loadFile: (id: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
  const schema = getSchema(buildExtensions());
  const node = PmNode.fromJSON(schema, doc);
  const wordDoc = await pageNodeToDocxDocument(node as any, async (src: string) => {
    const id = attachmentIdFromSrc(src);
    return (id && (await loadFile(id))) || new Uint8Array();
  });
  const blob = await Packer.toBlob(wordDoc as any);
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------- Excel ----------

export interface SheetTable {
  name: string;
  rows: string[][];
}

const cellText = (node: any): string => {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  // Absätze in einer Zelle mit Zeilenumbruch trennen
  const blockish = node.content.some((c: any) => c.type !== "text" && c.type !== "hardBreak");
  return node.content.map(cellText).join(blockish ? "\n" : "").trim();
};

/** Alle Tabellen eines Dokuments als Zeilen/Spalten-Text. */
export function extractTables(doc: PmDoc): string[][][] {
  const tables: string[][][] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "table") {
      tables.push(
        (n.content ?? []).map((row: any) => (row.content ?? []).map((cell: any) => cellText(cell))),
      );
      return;
    }
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return tables;
}

/** Excel-taugliche, eindeutige Blattnamen (max. 31 Zeichen, ohne []:*?/\). */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = (raw.replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").trim() || "Tabelle").slice(0, 31);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n++})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

const xmlEsc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const colName = (i: number) => {
  let s = "";
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
};

const NUMBER = /^-?\d+(?:[.,]\d+)?$/;

function sheetXml(rows: string[][]): string {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, c) => {
    const len = Math.max(8, ...rows.map((r) => Math.min(60, (r[c] ?? "").split("\n")[0].length + 2)));
    return `<col min="${c + 1}" max="${c + 1}" width="${len}" customWidth="1"/>`;
  }).join("");
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          const style = ri === 0 ? ' s="1"' : v.includes("\n") ? ' s="2"' : "";
          if (ri > 0 && NUMBER.test(v.trim())) {
            return `<c r="${ref}"${style}><v>${v.trim().replace(",", ".")}</v></c>`;
          }
          return v === ""
            ? ""
            : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/** Schreibt eine einfache XLSX-Datei: ein Blatt pro Tabelle, erste Zeile fett und fixiert. */
export async function buildXlsx(tables: SheetTable[]): Promise<Uint8Array> {
  const names = sheetNames(tables.map((t) => t.name));
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  tables.forEach((t, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(t.rows)));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Tabellen mehrerer Seiten sammeln; Blattname = Seitentitel (+ Nummer bei mehreren Tabellen). */
export function collectSheets(entries: { title: string; doc: PmDoc }[]): SheetTable[] {
  const sheets: SheetTable[] = [];
  for (const e of entries) {
    const tables = extractTables(e.doc);
    tables.forEach((rows, i) =>
      sheets.push({
        name: tables.length > 1 ? `${e.title || "Unbenannt"} ${i + 1}` : e.title || "Unbenannt",
        rows,
      }),
    );
  }
  return sheets;
}
