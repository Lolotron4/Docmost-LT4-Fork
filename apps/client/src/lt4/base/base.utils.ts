// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import dayjs from "dayjs";
import {
  CellValue,
  IDateValue,
  IBaseProperty,
  IBaseRow,
  ISelectOption,
  IViewConfig,
  IViewFilter,
  OPTION_COLORS,
} from "./types/base.types";

export function optionsOf(prop: IBaseProperty): ISelectOption[] {
  return prop.typeOptions?.options ?? [];
}

export function dateValueOf(value: CellValue): IDateValue | null {
  if (value && typeof value === "object" && !Array.isArray(value) && "start" in value) {
    return value;
  }
  return null;
}

/** Nur der Tag ("YYYY-MM-DD") des Beginns. */
export function dateOf(value: CellValue): string | null {
  return dateValueOf(value)?.start.slice(0, 10) ?? null;
}

export function timeOf(iso: string | undefined | null): string | null {
  return iso && iso.length > 10 ? iso.slice(11, 16) : null;
}

export function formatDate(iso: string | null, locale?: string) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale || undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "24.11.2026, 14:30–16:00" bzw. mit Enddatum an einem anderen Tag. */
export function formatDateValue(value: CellValue, locale?: string): string {
  const d = dateValueOf(value);
  if (!d) return "";
  let out = formatDate(d.start, locale);
  const t1 = timeOf(d.start);
  if (t1) out += `, ${t1}`;
  if (d.end) {
    const sameDay = d.end.slice(0, 10) === d.start.slice(0, 10);
    const t2 = timeOf(d.end);
    out += sameDay && t2 ? `–${t2}` : ` – ${formatDate(d.end, locale)}${t2 ? `, ${t2}` : ""}`;
  }
  return out;
}

export function isFormulaError(value: CellValue): value is { formulaError: string } {
  return !!value && typeof value === "object" && !Array.isArray(value) && "formulaError" in value;
}

/** Zellwert als Text für Suche, Filter und Sortierung. */
export function cellText(prop: IBaseProperty, value: CellValue): string {
  if (value === undefined || value === null) return "";
  const opts = optionsOf(prop);
  switch (prop.type) {
    case "select":
      return opts.find((o) => o.id === value)?.name ?? "";
    case "multiSelect":
      return Array.isArray(value)
        ? value.map((id) => opts.find((o) => o.id === id)?.name ?? "").filter(Boolean).join(", ")
        : "";
    case "date":
      return dateValueOf(value)?.start ?? "";
    case "checkbox":
      return value === true ? "✓" : "";
    case "formula":
      if (isFormulaError(value)) return "";
      if (typeof value === "boolean") return value ? "✓" : "";
      return String(value);
    default:
      return String(value);
  }
}

function isEmpty(value: CellValue) {
  if (isFormulaError(value)) return true;
  return value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
}

function matchesFilter(prop: IBaseProperty, row: IBaseRow, f: IViewFilter) {
  const value = row.cells[prop.id];
  const needle = (f.value ?? "").toLowerCase();
  switch (f.operator) {
    case "isEmpty":
      return isEmpty(value);
    case "isNotEmpty":
      return !isEmpty(value);
    case "checked":
      return value === true;
    case "unchecked":
      return value !== true;
    case "is":
    case "isNot": {
      let hit: boolean;
      if (prop.type === "select") hit = value === f.value;
      else if (prop.type === "multiSelect") hit = Array.isArray(value) && value.includes(f.value ?? "");
      else hit = cellText(prop, value).toLowerCase() === needle;
      return f.operator === "is" ? hit : !hit;
    }
    default:
      return !needle || cellText(prop, value).toLowerCase().includes(needle);
  }
}

function compare(prop: IBaseProperty, a: CellValue, b: CellValue) {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1; // Leere Zellen immer ans Ende
  if (isEmpty(b)) return -1;
  if (prop.type === "number") return (a as number) - (b as number);
  if (prop.type === "formula" && typeof a === "number" && typeof b === "number") return a - b;
  if (prop.type === "checkbox") return (a === true ? 0 : 1) - (b === true ? 0 : 1);
  if (prop.type === "select") {
    const order = optionsOf(prop).map((o) => o.id);
    return order.indexOf(a as string) - order.indexOf(b as string);
  }
  return cellText(prop, a).localeCompare(cellText(prop, b), undefined, { numeric: true, sensitivity: "base" });
}

/** Filter, Suche und Sortierung einer Ansicht anwenden. */
export function applyView(
  rows: IBaseRow[],
  properties: IBaseProperty[],
  config: IViewConfig,
  search: string,
): IBaseRow[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  let out = rows;
  for (const f of config.filters ?? []) {
    const prop = byId.get(f.propertyId);
    if (prop) out = out.filter((r) => matchesFilter(prop, r, f));
  }
  const q = search.trim().toLowerCase();
  if (q) {
    out = out.filter((r) =>
      properties.some((p) => cellText(p, r.cells[p.id]).toLowerCase().includes(q)),
    );
  }
  const sorts = (config.sorts ?? []).filter((s) => byId.has(s.propertyId));
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const prop = byId.get(s.propertyId)!;
        const va = a.cells[prop.id];
        const vb = b.cells[prop.id];
        // Leere Zellen bleiben unabhängig von der Richtung unten.
        if (isEmpty(va) !== isEmpty(vb)) return isEmpty(va) ? 1 : -1;
        const c = compare(prop, va, vb);
        if (c !== 0) return s.direction === "desc" ? -c : c;
      }
      return 0;
    });
  }
  return out;
}

export function nextOptionColor(options: ISelectOption[]) {
  return OPTION_COLORS[(options.length + 1) % OPTION_COLORS.length];
}

export function newOptionId() {
  return "o" + Math.random().toString(36).slice(2, 12);
}

export function todayIso() {
  return dayjs().format("YYYY-MM-DD");
}
