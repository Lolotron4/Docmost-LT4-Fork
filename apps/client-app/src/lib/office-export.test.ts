import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  attachmentIdFromSrc,
  buildDocx,
  buildXlsx,
  collectSheets,
  combineDocs,
  extractTables,
  pagesInTreeOrder,
  sheetNames,
} from "./office-export";

const cell = (text: string, type = "tableCell") => ({
  type,
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});
const table: any = {
  type: "table",
  content: [
    { type: "tableRow", content: [cell("Name", "tableHeader"), cell("Punkte", "tableHeader")] },
    { type: "tableRow", content: [cell("Anna & Ben"), cell("12,5")] },
    { type: "tableRow", content: [cell("<Carl>"), cell("")] },
  ],
};
const doc: any = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Hallo", marks: [{ type: "bold" }] }] },
    table,
  ],
};

describe("office-export", () => {
  it("liest Tabellen als Text", () => {
    expect(extractTables(doc)).toEqual([
      [
        ["Name", "Punkte"],
        ["Anna & Ben", "12,5"],
        ["<Carl>", ""],
      ],
    ]);
  });

  it("macht gültige, eindeutige Blattnamen", () => {
    expect(sheetNames(["A/B", "a/b", "x".repeat(40), ""])).toEqual([
      "A B",
      "a b (2)",
      "x".repeat(31),
      "Tabelle",
    ]);
  });

  it("schreibt eine XLSX mit einem Blatt pro Tabelle", async () => {
    const sheets = collectSheets([
      { title: "Noten", doc },
      { title: "Leer", doc: { type: "doc", content: [] } },
      { title: "Zwei", doc: { type: "doc", content: [table, table] } },
    ]);
    expect(sheets.map((s) => s.name)).toEqual(["Noten", "Zwei 1", "Zwei 2"]);
    const zip = await JSZip.loadAsync(await buildXlsx(sheets));
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain('name="Zwei 2"');
    const s1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(s1).toContain("Anna &amp; Ben");
    expect(s1).toContain("&lt;Carl&gt;");
    expect(s1).toContain("<v>12.5</v>"); // Zahl, nicht Text
    expect(zip.file("xl/worksheets/sheet3.xml")).toBeTruthy();
  });

  it("fügt Seiten mit Titel zusammen", () => {
    const c = combineDocs([
      { title: "Eins", doc },
      { title: "", doc: { type: "doc", content: [] } },
    ]);
    expect(c.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(c.content).toHaveLength(5);
  });

  it("erkennt lokale Anhänge", () => {
    expect(attachmentIdFromSrc("local-attachment/abc-1/bild.png")).toBe("abc-1");
    expect(attachmentIdFromSrc("https://x/y.png")).toBeNull();
  });

  it("baut ein Word-Dokument", async () => {
    const bytes = await buildDocx(combineDocs([{ title: "Seite", doc }]), async () => null);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Seite");
    expect(xml).toContain("Anna &amp; Ben");
    expect(xml).toContain("<w:tbl>");
  });

  it("sortiert Seiten wie im Baum", () => {
    const now = new Date().toISOString();
    const pg = (id: string, parentId: string | null, position: number) => ({
      id, parentId, position, spaceId: "s", title: id, icon: null, createdAt: now, updatedAt: now,
    });
    const state: any = {
      spaces: [{ id: "s", name: "S" }],
      pages: [pg("b", null, 2), pg("a", null, 1), pg("a2", "a", 1)],
      attachments: [],
    };
    expect(pagesInTreeOrder(state, ["s"]).map((p) => p.id)).toEqual(["a", "a2", "b"]);
  });
});
