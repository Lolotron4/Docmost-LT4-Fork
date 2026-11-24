// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { randomBytes } from 'node:crypto';

export const PROPERTY_TYPES = [
  'text',
  'number',
  'select',
  'multiSelect',
  'date',
  'checkbox',
  'url',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const VIEW_TYPES = ['table', 'kanban', 'calendar'] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export const OPTION_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const;

export type SelectOption = { id: string; name: string; color: string };
export type TypeOptions = { options?: SelectOption[] } & Record<string, unknown>;
export type DateValue = { start: string };

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function shortId(prefix = ''): string {
  const bytes = randomBytes(10);
  let out = prefix;
  for (const b of bytes) out += ALNUM[b % ALNUM.length];
  return out;
}

const MAX_TEXT = 10_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function getOptions(typeOptions: unknown): SelectOption[] {
  const raw = (typeOptions as TypeOptions)?.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o.id === 'string' && typeof o.name === 'string')
    .map((o) => ({
      id: o.id.slice(0, 40),
      name: o.name.slice(0, 200),
      color: OPTION_COLORS.includes(o.color as any) ? o.color : 'gray',
    }));
}

/** Bereinigt Typ-Optionen aus Benutzereingaben. */
export function sanitizeTypeOptions(type: PropertyType, input: unknown): TypeOptions | null {
  if (type === 'select' || type === 'multiSelect') {
    const seen = new Set<string>();
    const options = getOptions(input).filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
    return { options: options.slice(0, 200) };
  }
  return null;
}

/** Datum in "YYYY-MM-DD" umwandeln; akzeptiert auch "TT.MM.JJJJ" und ISO-Zeitstempel. */
export function parseDate(value: unknown): string | null {
  if (value && typeof value === 'object' && 'start' in (value as any)) {
    return parseDate((value as any).start);
  }
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (ISO_DATE.test(v)) return validDate(v);
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (iso) return validDate(iso[1]);
  const de = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) {
    return validDate(`${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`);
  }
  return null;
}

function validDate(v: string): string | null {
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/**
 * Prüft einen Zellwert gegen den Eigenschaftstyp. Gibt `undefined` zurück,
 * wenn die Zelle geleert werden soll.
 */
export function sanitizeCell(
  type: PropertyType,
  typeOptions: unknown,
  value: unknown,
): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  switch (type) {
    case 'text':
    case 'url':
      return typeof value === 'string' ? value.slice(0, MAX_TEXT) : String(value).slice(0, MAX_TEXT);
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'checkbox':
      return value === true ? true : undefined;
    case 'select': {
      const ids = new Set(getOptions(typeOptions).map((o) => o.id));
      return typeof value === 'string' && ids.has(value) ? value : undefined;
    }
    case 'multiSelect': {
      if (!Array.isArray(value)) return undefined;
      const ids = new Set(getOptions(typeOptions).map((o) => o.id));
      const out = [...new Set(value.filter((v) => typeof v === 'string' && ids.has(v)))];
      return out.length ? out : undefined;
    }
    case 'date': {
      const start = parseDate(value);
      return start ? { start } : undefined;
    }
  }
  return undefined;
}

/** Zellwert als Text (für Typwechsel und Suche). */
export function cellToText(type: PropertyType, typeOptions: unknown, value: unknown): string {
  if (value === undefined || value === null) return '';
  const options = getOptions(typeOptions);
  const name = (id: unknown) => options.find((o) => o.id === id)?.name ?? '';
  switch (type) {
    case 'select':
      return name(value);
    case 'multiSelect':
      return Array.isArray(value) ? value.map(name).filter(Boolean).join(', ') : '';
    case 'date':
      return parseDate(value) ?? '';
    case 'checkbox':
      return value === true ? 'true' : '';
    default:
      return String(value);
  }
}

const TRUTHY = new Set(['true', '1', 'x', 'ja', 'yes', 'y', 'j', '✓', '✔']);

/**
 * Wandelt alle Zellen einer Eigenschaft beim Typwechsel um. Neue Auswahl-
 * Optionen werden bei Bedarf angelegt und zurückgegeben.
 */
export function convertCells(
  from: { type: PropertyType; typeOptions: unknown },
  to: { type: PropertyType; typeOptions: unknown },
  values: unknown[],
): { values: unknown[]; typeOptions: TypeOptions | null } {
  const options = [...getOptions(to.typeOptions)];
  const fromIsSelect = from.type === 'select' || from.type === 'multiSelect';
  if (fromIsSelect && (to.type === 'select' || to.type === 'multiSelect') && options.length === 0) {
    options.push(...getOptions(from.typeOptions));
  }
  const optionFor = (label: string): string | undefined => {
    const name = label.trim().slice(0, 200);
    if (!name) return undefined;
    const found = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    if (options.length >= 200) return undefined;
    const opt = { id: shortId('o'), name, color: OPTION_COLORS[options.length % OPTION_COLORS.length] };
    options.push(opt);
    return opt.id;
  };

  const out = values.map((value) => {
    if (value === undefined || value === null) return undefined;
    if (from.type === to.type) return value;
    // Auswahl <-> Mehrfachauswahl: IDs übernehmen
    if (from.type === 'select' && to.type === 'multiSelect') return [value];
    if (from.type === 'multiSelect' && to.type === 'select') {
      return Array.isArray(value) ? value[0] : undefined;
    }
    const text = cellToText(from.type, from.typeOptions, value);
    switch (to.type) {
      case 'text':
      case 'url':
        return text || undefined;
      case 'number': {
        if (from.type === 'checkbox') return value === true ? 1 : undefined;
        const n = Number(text.replace(',', '.'));
        return text && Number.isFinite(n) ? n : undefined;
      }
      case 'checkbox':
        if (from.type === 'number') return value !== 0 ? true : undefined;
        return TRUTHY.has(text.trim().toLowerCase()) ? true : undefined;
      case 'select':
        return optionFor(from.type === 'multiSelect' ? text.split(',')[0] : text);
      case 'multiSelect': {
        const ids = text.split(',').map(optionFor).filter(Boolean);
        return ids.length ? [...new Set(ids)] : undefined;
      }
      case 'date': {
        const start = parseDate(text);
        return start ? { start } : undefined;
      }
    }
    return undefined;
  });

  const typeOptions =
    to.type === 'select' || to.type === 'multiSelect' ? { options } : null;
  return { values: out, typeOptions };
}

export function sanitizeViewConfig(input: unknown): Record<string, unknown> {
  const c = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const out: Record<string, unknown> = {};
  if (Array.isArray(c.sorts)) {
    out.sorts = c.sorts
      .slice(0, 5)
      .map((s: any) => ({
        propertyId: str(s?.propertyId),
        direction: s?.direction === 'desc' ? 'desc' : 'asc',
      }))
      .filter((s: any) => s.propertyId);
  }
  if (Array.isArray(c.filters)) {
    out.filters = c.filters
      .slice(0, 10)
      .map((f: any) => ({
        propertyId: str(f?.propertyId),
        operator: ['contains', 'is', 'isNot', 'isEmpty', 'isNotEmpty', 'checked', 'unchecked'].includes(f?.operator)
          ? f.operator
          : 'contains',
        value: typeof f?.value === 'string' || typeof f?.value === 'number' ? String(f.value).slice(0, 500) : undefined,
      }))
      .filter((f: any) => f.propertyId);
  }
  if (Array.isArray(c.hiddenPropertyIds)) {
    out.hiddenPropertyIds = c.hiddenPropertyIds.map((v: unknown) => str(v)).filter(Boolean).slice(0, 200);
  }
  if (c.propertyWidths && typeof c.propertyWidths === 'object') {
    const widths: Record<string, number> = {};
    for (const [k, v] of Object.entries(c.propertyWidths).slice(0, 200)) {
      if (typeof v === 'number' && v >= 60 && v <= 1200) widths[k.slice(0, 60)] = Math.round(v);
    }
    out.propertyWidths = widths;
  }
  for (const key of ['groupByPropertyId', 'datePropertyId']) {
    if (typeof c[key] === 'string') out[key] = str(c[key]);
  }
  if (Array.isArray(c.hiddenGroups)) {
    out.hiddenGroups = c.hiddenGroups.map((v: unknown) => str(v)).filter(Boolean).slice(0, 200);
  }
  return out;
}
