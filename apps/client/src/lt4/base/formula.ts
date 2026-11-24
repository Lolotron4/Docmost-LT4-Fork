// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Kleiner, sicherer Formel-Rechner für Datenbank-Spalten (kein eval).
import { CellValue, IBaseProperty, IBaseRow } from "./types/base.types";

export type FormulaValue = number | string | boolean | null;

export class FormulaError extends Error {}

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" }
  | { t: "," };

const OPS = ["<=", ">=", "!=", "==", "<>", "&&", "||", "+", "-", "*", "/", "%", "^", "<", ">", "=", "!", "&"];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      // Zahlen mit Punkt; ein Komma trennt Argumente.
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      if (!m) throw new FormulaError(`Unexpected "${c}"`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (j >= src.length) throw new FormulaError("Missing closing quote");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new FormulaError('Missing "}"');
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[A-Za-zÄÖÜäöüß_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_]*/)!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ t: c } as Token);
      i++;
      continue;
    }
    if (c === ";") {
      out.push({ t: "," });
      i++;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new FormulaError(`Unexpected "${c}"`);
    out.push({ t: "op", v: op });
    i += op.length;
  }
  return out;
}

type Node =
  | { k: "lit"; v: FormulaValue }
  | { k: "ref"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

const PREC: Record<string, number> = {
  "||": 1, or: 1,
  "&&": 2, and: 2,
  "==": 3, "=": 3, "!=": 3, "<>": 3,
  "<": 4, ">": 4, "<=": 4, ">=": 4,
  "&": 5,
  "+": 6, "-": 6,
  "*": 7, "/": 7, "%": 7,
  "^": 9,
};

export function parseFormula(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const binOp = (tok: Token | undefined): string | null => {
    if (!tok) return null;
    if (tok.t === "op" && tok.v in PREC) return tok.v;
    if (tok.t === "id" && (tok.v.toLowerCase() === "and" || tok.v.toLowerCase() === "or")) return tok.v.toLowerCase();
    return null;
  };

  function primary(): Node {
    const tok = next();
    if (!tok) throw new FormulaError("Unexpected end of formula");
    switch (tok.t) {
      case "num":
        return { k: "lit", v: tok.v };
      case "str":
        return { k: "lit", v: tok.v };
      case "ref":
        return { k: "ref", name: tok.v };
      case "(": {
        const e = expr(0);
        if (next()?.t !== ")") throw new FormulaError('Missing ")"');
        return e;
      }
      case "op":
        if (tok.v === "-" || tok.v === "!" || tok.v === "+") return { k: "un", op: tok.v, a: expr(8) };
        break;
      case "id": {
        const name = tok.v.toLowerCase();
        if (name === "true" || name === "wahr") return { k: "lit", v: true };
        if (name === "false" || name === "falsch") return { k: "lit", v: false };
        if (name === "not" || name === "nicht") return { k: "un", op: "!", a: expr(8) };
        if (peek()?.t === "(") {
          next();
          const args: Node[] = [];
          if (peek()?.t !== ")") {
            for (;;) {
              args.push(expr(0));
              if (peek()?.t === ",") {
                next();
                continue;
              }
              break;
            }
          }
          if (next()?.t !== ")") throw new FormulaError(`Missing ")" after ${tok.v}(`);
          // prop("Name") ist dasselbe wie {Name}
          if (name === "prop" && args.length === 1 && args[0].k === "lit") {
            return { k: "ref", name: String(args[0].v) };
          }
          return { k: "call", name, args };
        }
        throw new FormulaError(`Unknown name "${tok.v}". Use {${tok.v}} for a property.`);
      }
    }
    throw new FormulaError("Unexpected symbol");
  }

  function expr(minPrec: number): Node {
    let left = primary();
    for (;;) {
      const op = binOp(peek());
      if (!op) break;
      const prec = PREC[op];
      if (prec < minPrec) break;
      next();
      // ^ ist rechtsassoziativ
      const right = expr(op === "^" ? prec : prec + 1);
      left = { k: "bin", op, a: left, b: right };
    }
    return left;
  }

  const result = expr(0);
  if (pos < tokens.length) throw new FormulaError("Unexpected symbol after the formula");
  return result;
}

// ------------------------------------------------------------------ Auswerten

const num = (v: FormulaValue): number => {
  if (v === null || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) throw new FormulaError(`"${v}" is not a number`);
  return n;
};
const truthy = (v: FormulaValue) => !(v === null || v === false || v === 0 || v === "");
const str = (v: FormulaValue) => (v === null ? "" : typeof v === "number" ? String(+v.toFixed(10)) : String(v));
const isDate = (v: FormulaValue) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const toTime = (v: FormulaValue) => {
  if (!isDate(v)) throw new FormulaError(`"${str(v)}" is not a date`);
  const s = String(v);
  return new Date(s.length > 10 ? s : `${s}T00:00`).getTime();
};
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function compare(a: FormulaValue, b: FormulaValue): number {
  if (typeof a === "number" || typeof b === "number") return num(a) - num(b);
  return str(a).localeCompare(str(b), undefined, { numeric: true });
}

const FUNCS: Record<string, (args: FormulaValue[]) => FormulaValue> = {
  if: (a) => (truthy(a[0]) ? a[1] ?? null : a[2] ?? null),
  wenn: (a) => FUNCS.if(a),
  round: (a) => {
    const f = Math.pow(10, a[1] === undefined ? 0 : num(a[1]));
    return Math.round(num(a[0]) * f) / f;
  },
  runden: (a) => FUNCS.round(a),
  floor: (a) => Math.floor(num(a[0])),
  ceil: (a) => Math.ceil(num(a[0])),
  abs: (a) => Math.abs(num(a[0])),
  sqrt: (a) => {
    const n = num(a[0]);
    if (n < 0) throw new FormulaError("Square root of a negative number");
    return Math.sqrt(n);
  },
  wurzel: (a) => FUNCS.sqrt(a),
  pow: (a) => Math.pow(num(a[0]), num(a[1])),
  min: (a) => Math.min(...a.filter((x) => x !== null).map(num)),
  max: (a) => Math.max(...a.filter((x) => x !== null).map(num)),
  sum: (a) => a.reduce<number>((s, x) => s + num(x), 0),
  summe: (a) => FUNCS.sum(a),
  avg: (a) => {
    const vals = a.filter((x) => x !== null && x !== "");
    return vals.length ? vals.reduce<number>((s, x) => s + num(x), 0) / vals.length : null;
  },
  mittelwert: (a) => FUNCS.avg(a),
  len: (a) => str(a[0]).length,
  upper: (a) => str(a[0]).toUpperCase(),
  lower: (a) => str(a[0]).toLowerCase(),
  concat: (a) => a.map(str).join(""),
  empty: (a) => a[0] === null || a[0] === "",
  leer: (a) => FUNCS.empty(a),
  today: () => isoDay(new Date()),
  heute: () => FUNCS.today([]),
  now: () => {
    const d = new Date();
    return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  // Tage von a bis b (ohne Uhrzeit-Anteil gerundet)
  days: (a) => Math.round((toTime(a[1]) - toTime(a[0])) / 86_400_000),
  tage: (a) => FUNCS.days(a),
  hours: (a) => Math.round(((toTime(a[1]) - toTime(a[0])) / 3_600_000) * 100) / 100,
  stunden: (a) => FUNCS.hours(a),
  adddays: (a) => {
    const d = new Date(toTime(a[0]));
    d.setDate(d.getDate() + num(a[1]));
    return isoDay(d);
  },
  year: (a) => new Date(toTime(a[0])).getFullYear(),
  jahr: (a) => FUNCS.year(a),
  month: (a) => new Date(toTime(a[0])).getMonth() + 1,
  monat: (a) => FUNCS.month(a),
  day: (a) => new Date(toTime(a[0])).getDate(),
  tag: (a) => FUNCS.day(a),
};

export const FORMULA_FUNCTIONS = Object.keys(FUNCS);

export type ValueLookup = (name: string) => FormulaValue;

export function evaluate(node: Node, lookup: ValueLookup): FormulaValue {
  switch (node.k) {
    case "lit":
      return node.v;
    case "ref":
      return lookup(node.name);
    case "un": {
      const a = evaluate(node.a, lookup);
      if (node.op === "!") return !truthy(a);
      return node.op === "-" ? -num(a) : num(a);
    }
    case "bin": {
      const { op } = node;
      if (op === "&&" || op === "and") return truthy(evaluate(node.a, lookup)) && truthy(evaluate(node.b, lookup));
      if (op === "||" || op === "or") return truthy(evaluate(node.a, lookup)) || truthy(evaluate(node.b, lookup));
      const a = evaluate(node.a, lookup);
      const b = evaluate(node.b, lookup);
      switch (op) {
        case "+":
          return typeof a === "string" && !isNumeric(a) || typeof b === "string" && !isNumeric(b)
            ? str(a) + str(b)
            : num(a) + num(b);
        case "&":
          return str(a) + str(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/": {
          const d = num(b);
          if (d === 0) throw new FormulaError("Division by zero");
          return num(a) / d;
        }
        case "%":
          return num(a) % num(b);
        case "^":
          return Math.pow(num(a), num(b));
        case "=":
        case "==":
          return compare(a, b) === 0;
        case "!=":
        case "<>":
          return compare(a, b) !== 0;
        case "<":
          return compare(a, b) < 0;
        case ">":
          return compare(a, b) > 0;
        case "<=":
          return compare(a, b) <= 0;
        case ">=":
          return compare(a, b) >= 0;
      }
      throw new FormulaError(`Unknown operator ${op}`);
    }
    case "call": {
      const fn = FUNCS[node.name];
      if (!fn) throw new FormulaError(`Unknown function ${node.name}()`);
      // if() wertet nur den gewählten Zweig aus (z. B. gegen Division durch 0).
      if (node.name === "if" || node.name === "wenn") {
        return truthy(evaluate(node.args[0], lookup))
          ? node.args[1] ? evaluate(node.args[1], lookup) : null
          : node.args[2] ? evaluate(node.args[2], lookup) : null;
      }
      return fn(node.args.map((a) => evaluate(a, lookup)));
    }
  }
}

const isNumeric = (s: string) => s.trim() !== "" && Number.isFinite(Number(s.replace(",", ".")));

// -------------------------------------------------- Werte aus einer Zeile

function cellToFormula(prop: IBaseProperty, value: CellValue): FormulaValue {
  if (value === undefined || value === null) return null;
  switch (prop.type) {
    case "number":
      return value as number;
    case "checkbox":
      return value === true;
    case "select":
      return prop.typeOptions?.options?.find((o) => o.id === value)?.name ?? null;
    case "multiSelect":
      return Array.isArray(value)
        ? value.map((id) => prop.typeOptions?.options?.find((o) => o.id === id)?.name).filter(Boolean).join(", ")
        : null;
    case "date":
      return typeof value === "object" && !Array.isArray(value) && "start" in value ? value.start : null;
    default:
      return typeof value === "string" || typeof value === "number" ? value : null;
  }
}

export type FormulaResult = { value: FormulaValue } | { error: string };

/**
 * Berechnet alle Formel-Spalten. Formeln dürfen andere Formeln verwenden;
 * Kreisbezüge ergeben einen Fehler statt einer Endlosschleife.
 */
export function computeFormulas(
  rows: IBaseRow[],
  properties: IBaseProperty[],
): Map<string, Record<string, FormulaResult>> {
  const formulas = properties.filter((p) => p.type === "formula");
  const out = new Map<string, Record<string, FormulaResult>>();
  if (!formulas.length) return out;

  const byName = new Map(properties.map((p) => [p.name.trim().toLowerCase(), p]));
  const parsed = new Map<string, Node | FormulaError>();
  for (const f of formulas) {
    try {
      const expression = String((f.typeOptions as any)?.expression ?? "").trim();
      parsed.set(f.id, expression ? parseFormula(expression) : { k: "lit", v: null });
    } catch (e) {
      parsed.set(f.id, e instanceof FormulaError ? e : new FormulaError(String(e)));
    }
  }

  for (const row of rows) {
    const results: Record<string, FormulaResult> = {};
    const evalProp = (prop: IBaseProperty, stack: Set<string>): FormulaValue => {
      if (prop.type !== "formula") return cellToFormula(prop, row.cells[prop.id]);
      const cached = results[prop.id];
      if (cached) {
        if ("error" in cached) throw new FormulaError(cached.error);
        return cached.value;
      }
      if (stack.has(prop.id)) throw new FormulaError("Circular reference");
      const node = parsed.get(prop.id)!;
      if (node instanceof FormulaError) throw node;
      stack.add(prop.id);
      try {
        const value = evaluate(node, (name) => {
          const ref = byName.get(name.trim().toLowerCase());
          if (!ref) throw new FormulaError(`Unknown property {${name}}`);
          return evalProp(ref, stack);
        });
        const clean = typeof value === "number" && !Number.isFinite(value) ? null : value;
        results[prop.id] = { value: clean };
        return clean;
      } finally {
        stack.delete(prop.id);
      }
    };
    for (const f of formulas) {
      if (results[f.id]) continue;
      try {
        evalProp(f, new Set());
      } catch (e) {
        results[f.id] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    out.set(row.id, results);
  }
  return out;
}

export function formatFormulaValue(value: FormulaValue, locale?: string): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "number") return value.toLocaleString(locale || undefined, { maximumFractionDigits: 6 });
  return value;
}
