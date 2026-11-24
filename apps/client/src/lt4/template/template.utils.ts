// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import type { Editor, JSONContent } from "@tiptap/core";
import { getTemplateVariables, type TemplateVariable } from "@docmost/editor-ext";
import { ITemplate } from "./types/template.types";

/** Setzt den (vom Server vorbereiteten) Vorlagen-Inhalt in eine leere Seite ein. */
export function applyTemplateToPage(
  editor: Editor,
  titleEditor: Editor,
  template: ITemplate,
): boolean {
  if (!editor || editor.isDestroyed || !editor.isEmpty) return false;
  const content = template.content as JSONContent | undefined;
  if (content) {
    editor.chain().setContent(content, { emitUpdate: true }).focus("start").run();
  }
  if (template.title && titleEditor && !titleEditor.isDestroyed && titleEditor.isEmpty) {
    titleEditor.commands.setContent(
      { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: template.title }] }] },
      { emitUpdate: true },
    );
  }
  return true;
}

/** Variablen einer Vorlage; bei fehlerhaftem Inhalt eine leere Liste. */
export function templateVariablesOf(template?: ITemplate | null): TemplateVariable[] {
  try {
    return getTemplateVariables(template?.content as JSONContent);
  } catch {
    return [];
  }
}
