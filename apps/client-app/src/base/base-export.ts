// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Datenbanken für Word, PDF, Markdown und Excel als Tabelle (Kopfzeile = Eigenschaften).
import { cellText, formatDateValue } from "../../../client/src/lt4/base/base.utils";
import { computeFormulas, formatFormulaValue } from "../../../client/src/lt4/base/formula";
import type { CellValue, IBaseProperty } from "../../../client/src/lt4/base/types/base.types";
import type { PmDoc } from "../lib/types";
import type { LocalBase } from "./local-base";

function display(prop: IBaseProperty, value: CellValue): string {
  if (prop.type === "date") return formatDateValue(value, "de-DE");
  if (prop.type === "formula" && (typeof value === "number" || typeof value === "string" || typeof value === "boolean")) {
    return formatFormulaValue(value, "de-DE");
  }
  return cellText(prop, value);
}

/** Kopfzeile + Zeilen als Text, Formeln ausgerechnet. */
export function baseToRows(base: LocalBase): string[][] {
  const props = base.properties;
  const results = computeFormulas(base.rows, props);
  const rows = base.rows.map((row) => {
    const r = results.get(row.id) ?? {};
    return props.map((p) => {
      if (p.type === "formula") {
        const res = r[p.id];
        return res && "value" in res ? display(p, res.value as CellValue) : "";
      }
      return display(p, row.cells[p.id]);
    });
  });
  return [props.map((p) => p.name), ...rows];
}

const cell = (text: string, header: boolean) => ({
  type: header ? "tableHeader" : "tableCell",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});

/** Datenbank als Seiteninhalt mit einer Tabelle. */
export function baseToDoc(base: LocalBase): PmDoc {
  const rows = baseToRows(base);
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: rows.map((r, i) => ({
          type: "tableRow",
          content: r.map((t) => cell(t.split("\n").join(" "), i === 0)),
        })),
      },
    ],
  };
}
