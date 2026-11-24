// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Vorlagen: Variablen ersetzen und Anhang-IDs beim Kopieren umschreiben.
import { templateVariableNameKey } from '@docmost/editor-ext';

type JsonNode = {
  type?: string;
  attrs?: Record<string, any>;
  content?: JsonNode[];
  marks?: any[];
  text?: string;
};

export const MAX_VARIABLE_VALUE = 5000;

/** Werte nach Variablennamen (ohne Groß-/Kleinschreibung) normalisieren. */
export function normalizeValues(values?: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, value] of Object.entries(values ?? {})) {
    if (typeof value !== 'string') continue;
    map.set(templateVariableNameKey(name), value.slice(0, MAX_VARIABLE_VALUE));
  }
  return map;
}

/**
 * Ersetzt jede Variable durch den eingegebenen Text. Leere Werte entfernen die Variable.
 * Mehrzeilige Werte werden mit Zeilenumbrüchen eingefügt.
 */
export function substituteVariables<T>(doc: T, values: Map<string, string>): T {
  const visit = (node: JsonNode): JsonNode[] => {
    if (node?.type === 'templateVariable') {
      const key = templateVariableNameKey(String(node.attrs?.name ?? ''));
      const value = values.get(key) ?? '';
      const lines = value.replace(/\r\n?/g, '\n').split('\n');
      const out: JsonNode[] = [];
      lines.forEach((line, i) => {
        if (i > 0) out.push({ type: 'hardBreak' });
        if (line) {
          out.push(node.marks?.length ? { type: 'text', text: line, marks: node.marks } : { type: 'text', text: line });
        }
      });
      return out;
    }
    if (Array.isArray(node?.content)) {
      return [{ ...node, content: node.content.flatMap(visit) }];
    }
    return [node];
  };
  if (!doc) return doc;
  return visit(doc as JsonNode)[0] as T;
}

export function isEmptyDocument(doc: any): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true;
  return doc.content.every(
    (n: any) => n?.type === 'paragraph' && (!n.content || n.content.length === 0),
  );
}
