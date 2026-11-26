// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Aufgaben: Liest Checkbox-Einträge (taskItem) aus dem Seiteninhalt (ProseMirror-JSON).
// Eine Aufgabe ist ein Checkbox-Eintrag mit mindestens einer @Erwähnung einer Person
// (= zugewiesen). Ein Datum (/Datum) im selben Eintrag ist die Fälligkeit.
// Bewusst ohne Abhängigkeiten, damit auch Migrationen es nutzen können.

export type ExtractedTask = {
  /** Block-ID des ersten Absatzes im Eintrag (stabil über Bearbeitungen) */
  itemId: string;
  text: string;
  checked: boolean;
  /** YYYY-MM-DD oder null */
  dueDate: string | null;
  assignees: { userId: string; mentionId: string | null; assignedById: string | null }[];
};

type Json = { type?: string; attrs?: Record<string, any>; content?: Json[]; text?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDate(value: string): string {
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

/** Text, Erwähnungen und Datum eines Absatzes einsammeln (ohne verschachtelte Listen). */
function collectInline(
  node: Json,
  out: { parts: string[]; mentions: Json[]; dates: string[] },
) {
  if (!node) return;
  if (node.type === 'text' && typeof node.text === 'string') {
    out.parts.push(node.text);
    return;
  }
  if (node.type === 'mention') {
    const label = node.attrs?.label ?? '';
    // Personen am Zeilenanfang ("@Lea @Tom Plakat malen") nicht in den Text übernehmen,
    // die Zuweisung wird ohnehin separat angezeigt.
    const leading = out.parts.join('').trim() === '';
    if (node.attrs?.entityType === 'user') {
      if (!leading) out.parts.push(`@${label}`);
    } else {
      out.parts.push(String(label));
    }
    if (node.attrs?.entityType === 'user' && node.attrs?.entityId) out.mentions.push(node);
    return;
  }
  if (node.type === 'date') {
    const date = node.attrs?.date;
    if (typeof date === 'string' && DATE_RE.test(date)) {
      out.dates.push(date);
      out.parts.push(formatDate(date));
    }
    return;
  }
  if (node.type === 'hardBreak') {
    out.parts.push(' ');
    return;
  }
  if (node.type === 'taskList' || node.type === 'bulletList' || node.type === 'orderedList') {
    return; // verschachtelte Einträge gehören nicht zu diesem Eintrag
  }
  for (const child of node.content ?? []) collectInline(child, out);
}

export function extractTasks(doc: unknown): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const seen = new Set<string>();
  let index = 0;

  const walk = (node: Json) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'taskItem') {
      index++;
      const out = { parts: [] as string[], mentions: [] as Json[], dates: [] as string[] };
      let firstParagraphId: string | null = null;
      for (const child of node.content ?? []) {
        if (child.type === 'taskList' || child.type === 'bulletList' || child.type === 'orderedList') continue;
        if (!firstParagraphId && child.attrs?.id) firstParagraphId = String(child.attrs.id);
        collectInline(child, out);
        out.parts.push(' ');
      }
      if (out.mentions.length > 0) {
        let itemId = firstParagraphId ?? `pos-${index}`;
        if (seen.has(itemId)) itemId = `${itemId}-${index}`;
        seen.add(itemId);
        const assignees = new Map<string, ExtractedTask['assignees'][number]>();
        for (const m of out.mentions) {
          const userId = String(m.attrs!.entityId);
          if (!assignees.has(userId)) {
            assignees.set(userId, {
              userId,
              mentionId: m.attrs?.id ?? null,
              assignedById: m.attrs?.creatorId ?? null,
            });
          }
        }
        tasks.push({
          itemId,
          text: out.parts.join('').replace(/\s+/g, ' ').trim().slice(0, 500),
          checked: !!node.attrs?.checked,
          dueDate: out.dates[0] ?? null,
          assignees: [...assignees.values()],
        });
      }
    }
    for (const child of node.content ?? []) walk(child);
  };

  walk(doc as Json);
  return tasks;
}

/** IDs aller Erwähnungen, die zu Aufgaben gehören (dafür gibt es eine eigene Benachrichtigung). */
export function taskMentionIds(tasks: ExtractedTask[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tasks) for (const a of t.assignees) if (a.mentionId) ids.add(a.mentionId);
  return ids;
}
