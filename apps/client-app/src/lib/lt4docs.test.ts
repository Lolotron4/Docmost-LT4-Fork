import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildManifest,
  createLt4DocsZip,
  markdownPaths,
  planImport,
  readLt4DocsZip,
  safeFileName,
} from "./lt4docs";
import { between } from "../components/pattern-pad";
import { emptyState, type NotebookState } from "./types";

const ts = "2026-11-27T09:00:00.000Z";
const state = (): NotebookState => ({
  ...emptyState(),
  spaces: [
    { id: "s1", name: "Schule", createdAt: ts },
    { id: "s2", name: "Privat", createdAt: ts },
  ],
  pages: [
    { id: "p1", spaceId: "s1", parentId: null, title: "Projekt", position: 0, createdAt: ts, updatedAt: ts },
    { id: "p2", spaceId: "s1", parentId: "p1", title: "Quellen", position: 0, createdAt: ts, updatedAt: ts },
    { id: "p3", spaceId: "s2", parentId: null, title: "Projekt", position: 0, createdAt: ts, updatedAt: ts },
  ],
  attachments: [{ id: "a1", pageId: "p1", fileName: "../bild.png", mimeType: "image/png", size: 3 }],
});

const doc = (attId?: string) => ({
  type: "doc" as const,
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Hallo" }] },
    ...(attId ? [{ type: "image", attrs: { attachmentId: attId, src: `local-attachment/${attId}/bild.png` } }] : []),
  ],
});

describe("lt4docs (Client)", () => {
  it("filtert nach Bereichen", () => {
    const m = buildManifest(state(), ["s1"]);
    expect(m.format).toBe("lt4docs");
    expect(m.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(m.attachments[0].path).toBe("attachments/a1/bild.png");
  });

  it("schreibt und liest eine Datei mit neuen IDs", async () => {
    const bytes = await createLt4DocsZip({
      state: state(),
      loadDoc: async (id) => doc(id === "p1" ? "a1" : undefined),
      loadFile: async () => new Uint8Array([1, 2, 3]),
    });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toContain("pages/p1.json");
    const read = await readLt4DocsZip(bytes);
    let n = 0;
    const plan = planImport(read, () => `neu${n++}`);
    expect(plan.spaces).toHaveLength(2);
    expect(plan.pages.every((p) => p.id.startsWith("neu"))).toBe(true);
    const child = plan.pages.find((p) => p.title === "Quellen")!;
    const parent = plan.pages.find((p) => p.id === child.parentId)!;
    expect(parent.title).toBe("Projekt");
    const att = plan.attachments[0];
    expect(plan.files.get(att.id)).toEqual(new Uint8Array([1, 2, 3]));
    const img = plan.docs.get(parent.id)!.content!.find((x: any) => x.type === "image");
    expect(img.attrs.attachmentId).toBe(att.id);
  });

  it("lehnt neuere Versionen ab", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ format: "lt4docs", version: 99 }));
    await expect(readLt4DocsZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/Version 99/);
  });

  it("baut eindeutige Markdown-Pfade", () => {
    const s = state();
    s.pages.push({ id: "p4", spaceId: "s1", parentId: null, title: "Projekt", position: 1, createdAt: ts, updatedAt: ts });
    const paths = markdownPaths(s.spaces, s.pages);
    expect(paths.get("p2")).toBe("Schule/Projekt/Quellen.md");
    expect(paths.get("p4")).toBe("Schule/Projekt (2).md");
    expect(safeFileName("..")).toBe("datei");
  });

  it("Muster: übersprungene Punkte", () => {
    expect(between(0, 2)).toBe(1);
    expect(between(0, 8)).toBe(4);
    expect(between(0, 5)).toBeNull();
    expect(between(3, 5)).toBe(4);
  });
});
