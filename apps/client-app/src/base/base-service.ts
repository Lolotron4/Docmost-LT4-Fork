// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Lokaler Ersatz für apps/client/src/lt4/base/services/base-service.ts (gleiche Funktionen),
// damit die Datenbank-Oberfläche der Web-Version offline im Client läuft.
import type {
  BaseTemplate,
  CellValue,
  IBase,
  IBaseProperty,
  IBaseRow,
  IBaseView,
  IViewConfig,
  PropertyType,
  ViewType,
} from "../../../client/src/lt4/base/types/base.types";
import { convertCells, sanitizeCell, sanitizeTypeOptions, sanitizeViewConfig, shortId } from "./base-util";
import { lookupPage, MAX_PROPERTIES, MAX_ROWS, MAX_VIEWS, mutateBase, nextKey, readBase, type LocalBase } from "./local-base";

class LocalBaseError extends Error {
  response: { data: { message: string } };
  constructor(message: string) {
    super(message);
    this.response = { data: { message } };
  }
}

const now = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

function cleanCells(base: LocalBase, current: Record<string, CellValue>, patch: Record<string, unknown>) {
  const out = { ...current };
  for (const [id, value] of Object.entries(patch)) {
    const prop = base.properties.find((p) => p.id === id);
    if (!prop) continue;
    const clean = sanitizeCell(prop.type, prop.typeOptions, value);
    if (clean === undefined) delete out[id];
    else out[id] = clean;
  }
  return out;
}

function positionFor(base: LocalBase, opts: { afterRowId?: string | null; beforeRowId?: string | null; atStart?: boolean }, excludeId?: string) {
  const rows = base.rows.filter((r) => r.id !== excludeId);
  if (opts.atStart) return nextKey(null, rows[0]?.position ?? null);
  if (opts.afterRowId || opts.beforeRowId) {
    const idx = opts.afterRowId
      ? rows.findIndex((r) => r.id === opts.afterRowId) + 1
      : rows.findIndex((r) => r.id === opts.beforeRowId);
    if (idx >= 0) return nextKey(rows[idx - 1]?.position ?? null, rows[idx]?.position ?? null);
  }
  return nextKey(rows[rows.length - 1]?.position ?? null, null);
}

const sortRows = (rows: IBaseRow[]) =>
  rows.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1));
const sortProps = (props: IBaseProperty[]) =>
  props.sort((a, b) =>
    a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );

function uniqueName(props: IBaseProperty[], wanted: string) {
  const base = wanted.trim().slice(0, 200) || "Eigenschaft";
  const taken = new Set(props.map((p) => p.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return `${base} ${shortId()}`;
}

export async function getBase(pageId: string): Promise<IBase> {
  const base = await readBase(pageId);
  const page = lookupPage(pageId);
  return {
    id: pageId,
    slugId: pageId,
    title: page?.title ?? null,
    icon: page?.icon ?? null,
    spaceId: page?.spaceId ?? "",
    properties: clone(base.properties),
    views: clone(base.views),
    permissions: { canEdit: true },
  };
}

export async function getBaseRows(pageId: string) {
  return { items: clone((await readBase(pageId)).rows) };
}

export async function convertPageToBase(_pageId: string, _template?: BaseTemplate): Promise<{ id: string; slugId: string }> {
  throw new LocalBaseError("Im Client wird eine Datenbank über „Neue Datenbank“ angelegt.");
}

export const createProperty = (d: {
  pageId: string;
  name: string;
  type: PropertyType;
  typeOptions?: IBaseProperty["typeOptions"];
  afterPropertyId?: string;
}) =>
  mutateBase(d.pageId, (base) => {
    if (base.properties.length >= MAX_PROPERTIES) throw new LocalBaseError("Too many properties");
    const props = base.properties;
    const idx = d.afterPropertyId ? props.findIndex((p) => p.id === d.afterPropertyId) : props.length - 1;
    const prop: IBaseProperty = {
      id: shortId("p"),
      name: uniqueName(props, d.name),
      type: d.type,
      position: nextKey(props[idx]?.position ?? null, props[idx + 1]?.position ?? null),
      typeOptions: sanitizeTypeOptions(d.type, d.typeOptions),
      isPrimary: false,
    };
    props.push(prop);
    sortProps(props);
    return clone(prop);
  });

export const updateProperty = (d: {
  pageId: string;
  propertyId: string;
  name?: string;
  type?: PropertyType;
  typeOptions?: IBaseProperty["typeOptions"];
}) =>
  mutateBase(d.pageId, (base) => {
    const prop = base.properties.find((p) => p.id === d.propertyId);
    if (!prop) throw new LocalBaseError("Property not found");
    const newType = d.type ?? prop.type;
    if (prop.isPrimary && newType !== "text") throw new LocalBaseError("The first column is always text");
    if (d.name !== undefined && d.name.trim() !== prop.name) {
      prop.name = uniqueName(base.properties.filter((p) => p.id !== prop.id), d.name);
    }
    let typeOptions =
      d.typeOptions !== undefined
        ? sanitizeTypeOptions(newType, d.typeOptions)
        : newType === prop.type
          ? prop.typeOptions
          : sanitizeTypeOptions(newType, {});
    if (newType !== prop.type || d.typeOptions !== undefined) {
      const rows = base.rows.filter((r) => prop.id in r.cells);
      let values: unknown[] = rows.map((r) => r.cells[prop.id]);
      if (newType !== prop.type) {
        const conv = convertCells({ type: prop.type, typeOptions: prop.typeOptions }, { type: newType, typeOptions }, values);
        values = conv.values;
        typeOptions = conv.typeOptions;
      }
      rows.forEach((r, i) => {
        const clean = sanitizeCell(newType, typeOptions, values[i]);
        if (clean === undefined) delete r.cells[prop.id];
        else r.cells[prop.id] = clean;
      });
    }
    prop.type = newType;
    prop.typeOptions = typeOptions;
    return clone(prop);
  });

export const deleteProperty = (pageId: string, propertyId: string) =>
  mutateBase(pageId, (base) => {
    const prop = base.properties.find((p) => p.id === propertyId);
    if (!prop) throw new LocalBaseError("Property not found");
    if (prop.isPrimary) throw new LocalBaseError("The first column cannot be deleted");
    base.properties = base.properties.filter((p) => p.id !== propertyId);
    for (const r of base.rows) delete r.cells[propertyId];
  });

export const moveProperty = (pageId: string, propertyId: string, afterPropertyId: string | null) =>
  mutateBase(pageId, (base) => {
    const prop = base.properties.find((p) => p.id === propertyId);
    if (!prop) throw new LocalBaseError("Property not found");
    const props = base.properties.filter((p) => p.id !== propertyId);
    const idx = afterPropertyId ? props.findIndex((p) => p.id === afterPropertyId) : -1;
    const safeIdx = Math.max(idx, prop.isPrimary ? -1 : props.findIndex((p) => p.isPrimary));
    prop.position = nextKey(props[safeIdx]?.position ?? null, props[safeIdx + 1]?.position ?? null);
    sortProps(base.properties);
  });

export const createRow = (d: {
  pageId: string;
  cells?: Record<string, CellValue | null>;
  afterRowId?: string;
  atStart?: boolean;
}) =>
  mutateBase(d.pageId, (base) => {
    if (base.rows.length >= MAX_ROWS) throw new LocalBaseError("Too many rows");
    const ts = now();
    const row: IBaseRow = {
      id: crypto.randomUUID(),
      cells: cleanCells(base, {}, d.cells ?? {}),
      position: positionFor(base, d),
      createdAt: ts,
      updatedAt: ts,
      creatorId: null,
      lastUpdatedById: null,
    };
    base.rows.push(row);
    sortRows(base.rows);
    return clone(row);
  });

export const updateRow = (pageId: string, rowId: string, cells: Record<string, CellValue | null>) =>
  mutateBase(pageId, (base) => {
    const row = base.rows.find((r) => r.id === rowId);
    if (!row) throw new LocalBaseError("Row not found");
    row.cells = cleanCells(base, row.cells, cells);
    row.updatedAt = now();
    return clone(row);
  });

export const deleteRows = (pageId: string, rowIds: string[]) =>
  mutateBase(pageId, (base) => {
    const ids = new Set(rowIds);
    base.rows = base.rows.filter((r) => !ids.has(r.id));
  });

export const moveRow = (pageId: string, rowId: string, opts: { beforeRowId?: string | null; afterRowId?: string | null }) =>
  mutateBase(pageId, (base) => {
    const row = base.rows.find((r) => r.id === rowId);
    if (!row) throw new LocalBaseError("Row not found");
    row.position = positionFor(base, opts, rowId);
    sortRows(base.rows);
    return { position: row.position };
  });

export const createView = (d: { pageId: string; name: string; type: ViewType; config?: IViewConfig }) =>
  mutateBase(d.pageId, (base) => {
    if (base.views.length >= MAX_VIEWS) throw new LocalBaseError("Too many views");
    const view: IBaseView = {
      id: crypto.randomUUID(),
      name: d.name.trim() || "Ansicht",
      type: d.type,
      position: nextKey(base.views[base.views.length - 1]?.position ?? null, null),
      config: sanitizeViewConfig(d.config),
    };
    base.views.push(view);
    return clone(view);
  });

export const updateView = (d: { pageId: string; viewId: string; name?: string; config?: IViewConfig }) =>
  mutateBase(d.pageId, (base) => {
    const view = base.views.find((v) => v.id === d.viewId);
    if (!view) throw new LocalBaseError("View not found");
    if (d.name !== undefined && d.name.trim()) view.name = d.name.trim();
    if (d.config !== undefined) view.config = sanitizeViewConfig(d.config);
    return clone(view);
  });

export const deleteView = (pageId: string, viewId: string) =>
  mutateBase(pageId, (base) => {
    if (!base.views.some((v) => v.id === viewId)) throw new LocalBaseError("View not found");
    if (base.views.length <= 1) throw new LocalBaseError("A database needs at least one view");
    base.views = base.views.filter((v) => v.id !== viewId);
  });
