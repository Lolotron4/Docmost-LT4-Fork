// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Kleiner Parser für SCIM-Filter (RFC 7644, Abschnitt 3.4.2.2), z. B.
//   userName eq "max@schule.de"
//   externalId eq "1234" and active eq true
//   emails[type eq "work" and value co "@schule.de"]
//   emails[type eq "work"].value eq "max@schule.de"
//
// Gefiltert wird im Speicher auf den fertigen SCIM-Objekten. Für die Größen,
// für die LT4 gedacht ist (Schule, Vereine, kleine Teams), reicht das und
// verhält sich genau wie die Ausgabe.

export type ScimFilter =
  | { kind: 'and' | 'or'; left: ScimFilter; right: ScimFilter }
  | { kind: 'not'; filter: ScimFilter }
  | { kind: 'compare'; path: string; op: CompareOp; value: unknown }
  | { kind: 'present'; path: string }
  | { kind: 'valuePath'; attr: string; filter: ScimFilter; sub?: string; next?: { op: CompareOp; value: unknown } | 'pr' };

type CompareOp = 'eq' | 'ne' | 'co' | 'sw' | 'ew' | 'gt' | 'ge' | 'lt' | 'le';
const COMPARE_OPS = new Set(['eq', 'ne', 'co', 'sw', 'ew', 'gt', 'ge', 'lt', 'le']);

export class ScimFilterError extends Error {}

type Token =
  | { t: 'word'; v: string }
  | { t: 'string'; v: string }
  | { t: '(' | ')' | '[' | ']' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '(' || c === ')' || c === '[' || c === ']') {
      tokens.push({ t: c });
      i++;
    } else if (c === '"') {
      let v = '';
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          const n = input[i + 1];
          v += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else {
          v += input[i++];
        }
      }
      if (input[i] !== '"') throw new ScimFilterError('Unterminated string in filter');
      i++;
      tokens.push({ t: 'string', v });
    } else {
      let v = '';
      while (i < input.length && !/[\s()[\]"]/.test(input[i])) v += input[i++];
      // "emails[type eq "work"].value": der ".value"-Teil hängt am "]"
      tokens.push({ t: 'word', v });
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): ScimFilter {
    const f = this.parseOr();
    if (this.pos < this.tokens.length) throw new ScimFilterError('Unexpected token in filter');
    return f;
  }

  private peek() {
    return this.tokens[this.pos];
  }

  private isWord(v: string) {
    const t = this.peek();
    return t?.t === 'word' && t.v.toLowerCase() === v;
  }

  private parseOr(): ScimFilter {
    let left = this.parseAnd();
    while (this.isWord('or')) {
      this.pos++;
      left = { kind: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ScimFilter {
    let left = this.parseUnary();
    while (this.isWord('and')) {
      this.pos++;
      left = { kind: 'and', left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ScimFilter {
    if (this.isWord('not')) {
      this.pos++;
      return { kind: 'not', filter: this.parseUnary() };
    }
    const t = this.peek();
    if (t?.t === '(') {
      this.pos++;
      const f = this.parseOr();
      if (this.peek()?.t !== ')') throw new ScimFilterError('Missing ")" in filter');
      this.pos++;
      return f;
    }
    return this.parseAttrExpr();
  }

  private parseAttrExpr(): ScimFilter {
    const t = this.tokens[this.pos++];
    if (t?.t !== 'word') throw new ScimFilterError('Attribute expected in filter');
    const path = t.v;

    if (this.peek()?.t === '[') {
      this.pos++;
      const inner = this.parseOr();
      if (this.peek()?.t !== ']') throw new ScimFilterError('Missing "]" in filter');
      this.pos++;
      // optional ".sub" direkt hinter "]"
      let sub: string | undefined;
      const after = this.peek();
      if (after?.t === 'word' && after.v.startsWith('.')) {
        sub = after.v.slice(1);
        this.pos++;
      }
      let next: { op: CompareOp; value: unknown } | 'pr' | undefined;
      if (sub) {
        const opTok = this.peek();
        if (opTok?.t === 'word') {
          const op = opTok.v.toLowerCase();
          if (op === 'pr') {
            this.pos++;
            next = 'pr';
          } else if (COMPARE_OPS.has(op)) {
            this.pos++;
            next = { op: op as CompareOp, value: this.parseValue() };
          }
        }
      }
      return { kind: 'valuePath', attr: path, filter: inner, sub, next };
    }

    const opTok = this.tokens[this.pos++];
    if (opTok?.t !== 'word') throw new ScimFilterError('Operator expected in filter');
    const op = opTok.v.toLowerCase();
    if (op === 'pr') return { kind: 'present', path };
    if (!COMPARE_OPS.has(op)) throw new ScimFilterError(`Unsupported operator "${opTok.v}"`);
    return { kind: 'compare', path, op: op as CompareOp, value: this.parseValue() };
  }

  private parseValue(): unknown {
    const t = this.tokens[this.pos++];
    if (!t) throw new ScimFilterError('Value expected in filter');
    if (t.t === 'string') return t.v;
    if (t.t !== 'word') throw new ScimFilterError('Value expected in filter');
    const v = t.v.toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    const n = Number(t.v);
    if (!Number.isNaN(n)) return n;
    throw new ScimFilterError(`Invalid value "${t.v}" in filter`);
  }
}

export function parseScimFilter(input: string): ScimFilter {
  return new Parser(tokenize(input ?? '')).parse();
}

// ------------------------------------------------------------- Auswertung

/** Entfernt ein vorangestelltes Schema-URN ("urn:...:User:userName" → "userName"). */
export function stripSchemaUrn(path: string): string {
  if (!path.toLowerCase().startsWith('urn:')) return path;
  const idx = path.lastIndexOf(':');
  return path.slice(idx + 1);
}

function getKey(obj: any, key: string): unknown {
  if (obj == null || typeof obj !== 'object') return undefined;
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

/** Alle Werte eines Pfads wie "emails.value" (mehrwertige Attribute werden aufgefächert). */
export function valuesAt(obj: any, path: string): unknown[] {
  let current: unknown[] = [obj];
  for (const segment of stripSchemaUrn(path).split('.')) {
    const next: unknown[] = [];
    for (const item of current) {
      const v = getKey(item, segment);
      if (Array.isArray(v)) next.push(...v);
      else if (v !== undefined) next.push(v);
    }
    current = next;
  }
  return current;
}

function compare(actual: unknown, op: CompareOp, expected: unknown): boolean {
  if (actual === null || actual === undefined) return op === 'ne' ? expected !== null : expected === null && op === 'eq';
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    const a = typeof actual === 'string' ? actual.toLowerCase() === 'true' : Boolean(actual);
    const e = typeof expected === 'string' ? expected.toLowerCase() === 'true' : Boolean(expected);
    if (op === 'eq') return a === e;
    if (op === 'ne') return a !== e;
    return false;
  }
  // Groß-/Kleinschreibung spielt bei den hier genutzten Attributen keine Rolle
  const a = String(actual).toLowerCase();
  const e = String(expected ?? '').toLowerCase();
  switch (op) {
    case 'eq':
      return a === e;
    case 'ne':
      return a !== e;
    case 'co':
      return a.includes(e);
    case 'sw':
      return a.startsWith(e);
    case 'ew':
      return a.endsWith(e);
    case 'gt':
      return a > e;
    case 'ge':
      return a >= e;
    case 'lt':
      return a < e;
    case 'le':
      return a <= e;
  }
}

function present(v: unknown) {
  return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
}

export function matchesScimFilter(resource: any, filter: ScimFilter): boolean {
  switch (filter.kind) {
    case 'and':
      return matchesScimFilter(resource, filter.left) && matchesScimFilter(resource, filter.right);
    case 'or':
      return matchesScimFilter(resource, filter.left) || matchesScimFilter(resource, filter.right);
    case 'not':
      return !matchesScimFilter(resource, filter.filter);
    case 'present':
      return valuesAt(resource, filter.path).some(present);
    case 'compare': {
      const values = valuesAt(resource, filter.path);
      if (filter.op === 'ne') return values.length === 0 || values.every((v) => compare(v, 'ne', filter.value));
      return values.some((v) => compare(v, filter.op, filter.value));
    }
    case 'valuePath': {
      const items = valuesAt(resource, filter.attr).filter((item) =>
        matchesScimFilter(item, filter.filter),
      );
      if (!filter.sub) return items.length > 0;
      const subs = items.flatMap((item) => valuesAt(item, filter.sub));
      if (!filter.next) return subs.some(present);
      if (filter.next === 'pr') return subs.some(present);
      const { op, value } = filter.next;
      return subs.some((v) => compare(v, op, value));
    }
  }
}

// ------------------------------------------------------------- PATCH-Pfade

export interface ScimPatchPath {
  /** Attribut auf oberster Ebene, z. B. "emails", "name", "active" (kleingeschrieben) */
  attr: string;
  /** Filter für mehrwertige Attribute: members[value eq "..."] */
  filter?: ScimFilter;
  /** Unterattribut: name.givenName → "givenname", emails[...].value → "value" */
  sub?: string;
}

/** "urn:...:User:name.givenName", "emails[type eq \"work\"].value", "members[value eq \"x\"]" */
export function parseScimPatchPath(path: string): ScimPatchPath {
  const raw = (path ?? '').trim();
  const bracket = raw.indexOf('[');
  if (bracket === -1) {
    const [attr, ...rest] = stripSchemaUrn(raw).split('.');
    return { attr: attr.toLowerCase(), sub: rest.length ? rest.join('.').toLowerCase() : undefined };
  }
  const close = raw.lastIndexOf(']');
  if (close < bracket) throw new ScimFilterError('Invalid path');
  const attr = stripSchemaUrn(raw.slice(0, bracket)).toLowerCase();
  const filter = parseScimFilter(raw.slice(bracket + 1, close));
  const rest = raw.slice(close + 1);
  const sub = rest.startsWith('.') ? rest.slice(1).toLowerCase() : undefined;
  return { attr, filter, sub };
}
