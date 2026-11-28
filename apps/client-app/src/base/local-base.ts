// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Datenbanken (Tabelle, Kanban, Kalender) lokal im Tresor. Eine Datenbank ist eine Seite
// mit `isBase`; Eigenschaften, Ansichten und Zeilen liegen verschlüsselt unter "base-<seiten-id>".
// Die Oberfläche kommt unverändert aus apps/client (lt4/base); deren Server-Aufrufe
// (services/base-service.ts) leitet vite.config.ts auf ./base-service.ts um.
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { data } from "../lib/native";
import type {
  BaseTemplate,
  IBaseProperty,
  IBaseRow,
  IBaseView,
  ViewType,
} from "../../../client/src/lt4/base/types/base.types";
import { shortId } from "./base-util";

export interface LocalBase {
  format: "lt4-base";
  version: 1;
  properties: IBaseProperty[];
  views: IBaseView[];
  rows: IBaseRow[];
}

export const baseKey = (pageId: string) => `base-${pageId}`;
export const MAX_ROWS = 5000;
export const MAX_PROPERTIES = 100;
export const MAX_VIEWS = 20;

const cache = new Map<string, LocalBase>();
const queues = new Map<string, Promise<unknown>>();

export const emptyBase = (): LocalBase => ({ format: "lt4-base", version: 1, properties: [], views: [], rows: [] });

const cmp = (a: { position: string; id: string }, b: { position: string; id: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1;

/** Prüft und ordnet eingelesene Datenbank-Daten (aus Datei oder Import). */
export function normalizeBase(raw: any): LocalBase {
  const out = emptyBase();
  if (!raw || typeof raw !== "object") return out;
  out.properties = (Array.isArray(raw.properties) ? raw.properties : [])
    .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.type === "string")
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      position: String(p.position ?? "a0"),
      typeOptions: p.typeOptions ?? null,
      isPrimary: !!p.isPrimary,
    }));
  if (!out.properties.some((p) => p.isPrimary)) {
    const first = out.properties.find((p) => p.type === "text");
    if (first) first.isPrimary = true;
    else out.properties.unshift({ id: shortId("p"), name: "Name", type: "text", position: "a0", typeOptions: null, isPrimary: true });
  }
  out.properties.sort((a, b) => (a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : cmp(a, b)));
  out.views = (Array.isArray(raw.views) ? raw.views : [])
    .filter((v: any) => v && typeof v.id === "string" && ["table", "kanban", "calendar"].includes(v.type))
    .map((v: any) => ({ id: v.id, name: String(v.name ?? "Tabelle"), type: v.type, position: String(v.position ?? "a0"), config: v.config ?? {} }))
    .sort(cmp);
  if (!out.views.length) out.views.push({ id: crypto.randomUUID(), name: "Tabelle", type: "table", position: "a0", config: {} });
  out.rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .filter((r: any) => r && typeof r.id === "string")
    .slice(0, MAX_ROWS)
    .map((r: any) => ({
      id: r.id,
      cells: r.cells && typeof r.cells === "object" ? r.cells : {},
      position: String(r.position ?? "a0"),
      createdAt: r.createdAt ?? new Date().toISOString(),
      updatedAt: r.updatedAt ?? new Date().toISOString(),
      creatorId: null,
      lastUpdatedById: null,
    }))
    .sort(cmp);
  return out;
}

export async function readBase(pageId: string): Promise<LocalBase> {
  const hit = cache.get(pageId);
  if (hit) return hit;
  const raw = await data.read(baseKey(pageId));
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const base = normalizeBase(parsed);
  cache.set(pageId, base);
  return base;
}

export async function writeBase(pageId: string, base: LocalBase) {
  cache.set(pageId, base);
  await data.write(baseKey(pageId), JSON.stringify(base));
}

/** Änderungen pro Datenbank nacheinander ausführen (kein Überschreiben bei schnellen Klicks). */
export function mutateBase<T>(pageId: string, fn: (base: LocalBase) => T | Promise<T>): Promise<T> {
  const prev = queues.get(pageId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const base = await readBase(pageId);
      const copy: LocalBase = structuredClone(base);
      const result = await fn(copy);
      await writeBase(pageId, copy);
      changeListener?.(pageId);
      return result;
    });
  queues.set(pageId, next);
  return next;
}

export async function removeBase(pageId: string) {
  cache.delete(pageId);
  await data.remove(baseKey(pageId)).catch(() => undefined);
}

export function forgetBaseCache() {
  cache.clear();
  queues.clear();
}

let changeListener: ((pageId: string) => void) | null = null;
export function onBaseChanged(fn: ((pageId: string) => void) | null) {
  changeListener = fn;
}

export const nextKey = (before: string | null, after: string | null) => generateJitteredKeyBetween(before, after);

/** Neue Datenbank aus Vorlage, wie auf dem Server (deutsch beschriftet). */
export function templateBase(template: BaseTemplate = "table"): LocalBase {
  const base = emptyBase();
  const ts = new Date().toISOString();
  const props: Omit<IBaseProperty, "position">[] = [
    { id: shortId("p"), name: "Name", type: "text", typeOptions: null, isPrimary: true },
  ];
  let statusId: string | null = null;
  let dateId: string | null = null;
  if (template === "kanban") {
    statusId = shortId("p");
    props.push({
      id: statusId,
      name: "Status",
      type: "select",
      isPrimary: false,
      typeOptions: {
        options: [
          { id: shortId("o"), name: "Zu erledigen", color: "gray" },
          { id: shortId("o"), name: "In Arbeit", color: "blue" },
          { id: shortId("o"), name: "Erledigt", color: "green" },
        ],
      },
    });
    props.push({ id: shortId("p"), name: "Zuständig", type: "text", typeOptions: null, isPrimary: false });
  } else if (template === "calendar") {
    dateId = shortId("p");
    props.push({ id: dateId, name: "Datum", type: "date", typeOptions: { includeTime: false }, isPrimary: false });
    props.push({ id: shortId("p"), name: "Notizen", type: "text", typeOptions: null, isPrimary: false });
  } else {
    props.push({ id: shortId("p"), name: "Tags", type: "multiSelect", typeOptions: { options: [] }, isPrimary: false });
    props.push({ id: shortId("p"), name: "Notizen", type: "text", typeOptions: null, isPrimary: false });
  }
  let pos: string | null = null;
  for (const p of props) {
    pos = nextKey(pos, null);
    base.properties.push({ ...p, position: pos });
  }
  const views: { name: string; type: ViewType; config: IBaseView["config"] }[] = [];
  if (template === "kanban") views.push({ name: "Board", type: "kanban", config: { groupByPropertyId: statusId! } });
  else if (template === "calendar") views.push({ name: "Kalender", type: "calendar", config: { datePropertyId: dateId! } });
  views.push({ name: "Tabelle", type: "table", config: {} });
  pos = null;
  for (const v of views) {
    pos = nextKey(pos, null);
    base.views.push({ id: crypto.randomUUID(), position: pos, ...v });
  }
  if (template === "table" || template === "form") {
    pos = null;
    for (let i = 0; i < 3; i++) {
      pos = nextKey(pos, null);
      base.rows.push({ id: crypto.randomUUID(), cells: {}, position: pos, createdAt: ts, updatedAt: ts, creatorId: null, lastUpdatedById: null });
    }
  }
  return base;
}

/** Seiten-Infos für getBase (Titel, Bereich), vom Store gesetzt. */
let pageLookup: (id: string) => { title: string; icon?: string | null; spaceId: string } | undefined = () => undefined;
export function setBasePageLookup(fn: typeof pageLookup) {
  pageLookup = fn;
}
export const lookupPage = (id: string) => pageLookup(id);
