// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Datenbanken (Tabelle/Kanban/Kalender) im Format ".lt4docs":
 * Seiten mit `isBase: true` haben zusätzlich `bases/<seiten-id>.json`
 * mit { properties, views, rows } im gleichen Aufbau wie die LT4-Datenbank-API.
 * Hier werden diese Daten für den Import geprüft und bereinigt.
 */
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import {
  PROPERTY_TYPES,
  PropertyType,
  VIEW_TYPES,
  ViewType,
  sanitizeCell,
  sanitizeTypeOptions,
  sanitizeViewConfig,
  shortId,
} from '../base/base.util';

export const LT4DOCS_BASE_MAX_ROWS = 5000;
const MAX_PROPERTIES = 100;
const MAX_VIEWS = 30;
const PROP_ID = /^[A-Za-z0-9_-]{1,40}$/;

export interface PlannedBase {
  properties: {
    id: string;
    name: string;
    type: PropertyType;
    position: string;
    typeOptions: unknown;
    isPrimary: boolean;
  }[];
  views: { name: string; type: ViewType; position: string; config: Record<string, unknown> }[];
  rows: { position: string; cells: Record<string, unknown> }[];
}

const byPos = (a: { position?: unknown }, b: { position?: unknown }) => {
  const pa = String(a.position ?? '');
  const pb = String(b.position ?? '');
  return pa < pb ? -1 : pa > pb ? 1 : 0;
};

/** Bereinigt die Datenbank-Daten einer Seite. Positionen werden neu vergeben. */
export function planBaseImport(raw: unknown): PlannedBase {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;

  // Eigenschaften: IDs bleiben (Ansichten und Zellen verweisen darauf), Namen eindeutig.
  const taken = new Set<string>();
  const seenIds = new Set<string>();
  const props: PlannedBase['properties'] = [];
  const rawProps = (Array.isArray(src.properties) ? src.properties : [])
    .filter((p: any) => p && PROP_ID.test(String(p.id ?? '')) && (PROPERTY_TYPES as readonly string[]).includes(p.type))
    .slice()
    .sort((a: any, b: any) => (!!a.isPrimary !== !!b.isPrimary ? (a.isPrimary ? -1 : 1) : byPos(a, b)));
  let hasPrimary = false;
  for (const p of rawProps) {
    if (props.length >= MAX_PROPERTIES || seenIds.has(p.id)) continue;
    seenIds.add(p.id);
    const base = String(p.name ?? '').trim().slice(0, 200) || 'Eigenschaft';
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    taken.add(name.toLowerCase());
    const isPrimary = !hasPrimary && !!p.isPrimary && p.type === 'text';
    if (isPrimary) hasPrimary = true;
    props.push({
      id: p.id,
      name,
      type: p.type,
      position: '',
      typeOptions: sanitizeTypeOptions(p.type, p.typeOptions),
      isPrimary,
    });
  }
  if (!hasPrimary) {
    const firstText = props.find((p) => p.type === 'text');
    if (firstText) firstText.isPrimary = true;
    else {
      let name = 'Name';
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `Name ${i}`;
      props.unshift({ id: shortId('p'), name, type: 'text', position: '', typeOptions: null, isPrimary: true });
    }
  }
  props.sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
  let pos: string | null = null;
  for (const p of props) {
    pos = generateJitteredKeyBetween(pos, null);
    p.position = pos;
  }
  const propIds = new Set(props.map((p) => p.id));

  const views: PlannedBase['views'] = [];
  pos = null;
  for (const v of (Array.isArray(src.views) ? src.views : []).slice().sort(byPos)) {
    if (!v || !(VIEW_TYPES as readonly string[]).includes(v.type) || views.length >= MAX_VIEWS) continue;
    const config = sanitizeViewConfig(v.config) as Record<string, any>;
    for (const key of ['groupByPropertyId', 'datePropertyId']) {
      if (config[key] && !propIds.has(config[key])) delete config[key];
    }
    pos = generateJitteredKeyBetween(pos, null);
    views.push({ name: String(v.name ?? '').trim().slice(0, 200) || 'Tabelle', type: v.type, position: pos, config });
  }
  if (!views.length) {
    views.push({ name: 'Tabelle', type: 'table', position: generateJitteredKeyBetween(null, null), config: {} });
  }

  const rows: PlannedBase['rows'] = [];
  pos = null;
  for (const r of (Array.isArray(src.rows) ? src.rows : []).slice().sort(byPos)) {
    if (!r || typeof r !== 'object' || rows.length >= LT4DOCS_BASE_MAX_ROWS) continue;
    const cells: Record<string, unknown> = {};
    const rawCells = r.cells && typeof r.cells === 'object' ? r.cells : {};
    for (const p of props) {
      const clean = sanitizeCell(p.type, p.typeOptions, rawCells[p.id]);
      if (clean !== undefined) cells[p.id] = clean;
    }
    pos = generateJitteredKeyBetween(pos, null);
    rows.push({ position: pos, cells });
  }
  return { properties: props, views, rows };
}
