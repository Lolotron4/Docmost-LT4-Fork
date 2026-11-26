// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Färbt das Datum in offenen Aufgaben (Checkbox) ein: überfällig rot, heute orange.
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { todayString } from "./task-service";
import "./task-highlight.css";

const key = new PluginKey("lt4TaskHighlight");

function build(doc: PMNode): DecorationSet {
  const today = todayString();
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "taskItem") return true;
    if (node.attrs.checked) return true;
    // Nur der eigene Absatz zählt (nicht verschachtelte Unteraufgaben)
    let due: string | null = null;
    let hasPerson = false;
    node.forEach((child) => {
      if (child.type.name === "taskList") return;
      child.descendants((inline) => {
        if (inline.type.name === "date" && !due) due = inline.attrs.date;
        if (inline.type.name === "mention" && inline.attrs.entityType === "user") hasPerson = true;
        return true;
      });
    });
    const cls = [
      hasPerson ? "lt4-task-assigned" : "",
      due && due < today ? "lt4-task-overdue" : due === today ? "lt4-task-due-today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (cls) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }));
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

export const Lt4TaskHighlight = Extension.create({
  name: "lt4TaskHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});
