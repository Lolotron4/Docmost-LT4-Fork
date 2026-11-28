import { describe, expect, it } from "vitest";
import { createLt4DocsZip, planImport, readLt4DocsZip } from "../lib/lt4docs";
import { emptyState, type NotebookState } from "../lib/types";
import { normalizeBase, templateBase } from "./local-base";
import { baseToDoc, baseToRows } from "./base-export";
import { convertCells, sanitizeCell } from "./base-util";

const ts = "2026-11-28T09:00:00.000Z";

describe("Datenbanken im Client", () => {
  it("Kanban-Vorlage: Name, Status mit drei Spalten, Board + Tabelle", () => {
    const b = templateBase("kanban");
    expect(b.properties.map((p) => p.name)).toEqual(["Name", "Status", "Zuständig"]);
    expect(b.properties[0].isPrimary).toBe(true);
    expect(b.properties[1].typeOptions?.options?.map((o) => o.name)).toEqual(["Zu erledigen", "In Arbeit", "Erledigt"]);
    expect(b.views.map((v) => v.type)).toEqual(["kanban", "table"]);
    expect(b.views[0].config.groupByPropertyId).toBe(b.properties[1].id);
    expect(b.properties[0].position < b.properties[1].position).toBe(true);
  });

  it("Kalender-Vorlage zeigt Termine über die Datums-Eigenschaft", () => {
    const b = templateBase("calendar");
    const date = b.properties.find((p) => p.type === "date")!;
    expect(b.views[0]).toMatchObject({ type: "calendar", config: { datePropertyId: date.id } });
  });

  it("prüft Zellwerte wie der Server", () => {
    expect(sanitizeCell("number", null, "3,5")).toBe(3.5);
    expect(sanitizeCell("date", { includeTime: false }, "28.11.2026")).toEqual({ start: "2026-11-28" });
    expect(sanitizeCell("date", { includeTime: true }, { start: "2026-11-28T10:00", end: "2026-11-28T09:00" })).toEqual({
      start: "2026-11-28T10:00",
    });
    expect(sanitizeCell("select", { options: [{ id: "o1", name: "A", color: "red" }] }, "nope")).toBeUndefined();
    const conv = convertCells({ type: "text", typeOptions: null }, { type: "select", typeOptions: null }, ["Rot", "rot", "Blau"]);
    expect(conv.typeOptions?.options).toHaveLength(2);
    expect(conv.values[0]).toBe(conv.values[1]);
  });

  it("exportiert als Tabelle mit Auswahl-Namen und Formeln", () => {
    const b = normalizeBase({
      properties: [
        { id: "p1", name: "Name", type: "text", position: "a0", isPrimary: true },
        { id: "p2", name: "Status", type: "select", position: "a1", typeOptions: { options: [{ id: "o1", name: "Fertig", color: "green" }] } },
        { id: "p3", name: "Punkte", type: "number", position: "a2" },
        { id: "p4", name: "Doppelt", type: "formula", position: "a3", typeOptions: { expression: "{Punkte} * 2" } },
      ],
      views: [{ id: "v1", name: "Tabelle", type: "table", position: "a0", config: {} }],
      rows: [{ id: "r1", position: "a0", cells: { p1: "Referat", p2: "o1", p3: 7 } }],
    });
    expect(baseToRows(b)).toEqual([
      ["Name", "Status", "Punkte", "Doppelt"],
      ["Referat", "Fertig", "7", "14"],
    ]);
    const doc = baseToDoc(b);
    expect(doc.content![0].type).toBe("table");
    expect(doc.content![0].content[0].content[0].type).toBe("tableHeader");
  });

  it("nimmt Datenbanken verlustfrei in .lt4docs mit", async () => {
    const state: NotebookState = {
      ...emptyState(),
      spaces: [{ id: "s1", name: "Schule", createdAt: ts }],
      pages: [{ id: "b1", spaceId: "s1", parentId: null, title: "Aufgaben", position: 0, createdAt: ts, updatedAt: ts, isBase: true }],
    };
    const base = templateBase("kanban");
    base.rows.push({ id: "r1", cells: { [base.properties[0].id]: "Folien" }, position: "a0", createdAt: ts, updatedAt: ts, creatorId: null, lastUpdatedById: null });
    const bytes = await createLt4DocsZip({
      state,
      loadDoc: async () => ({ type: "doc", content: [{ type: "paragraph" }] }),
      loadFile: async () => null,
      loadBase: async () => base,
    });
    const read = await readLt4DocsZip(bytes);
    expect(read.manifest.pages[0].isBase).toBe(true);
    const plan = planImport(read, () => "neu1");
    expect(plan.pages[0]).toMatchObject({ id: "neu1", isBase: true });
    const imported = plan.bases.get("neu1")!;
    expect(imported.properties).toEqual(base.properties);
    expect(imported.views).toEqual(base.views);
    expect(imported.rows[0].cells).toEqual(base.rows[0].cells);
  });
});
