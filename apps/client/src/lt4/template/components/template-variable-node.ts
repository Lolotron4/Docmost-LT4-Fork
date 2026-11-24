// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Variablen im Vorlagen-Editor: als Chip anzeigen, per Klick bearbeiten, per /Variable einfügen.
// Die eigentliche Eingabe passiert im TemplateVariableDialog, der auf ein Fenster-Ereignis hört.
import { NodeSelection } from "@tiptap/pm/state";
import { TemplateVariableNode } from "@docmost/editor-ext";

export const TEMPLATE_VARIABLE_EVENT = "lt4-template-variable";

export type TemplateVariableEventDetail =
  | { mode: "insert" }
  | { mode: "edit"; pos: number; attrs: Record<string, any> };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lt4TemplateVariable: {
      insertTemplateVariable?: () => ReturnType;
    };
  }
}

export const EditableTemplateVariable = TemplateVariableNode.extend({
  selectable: true,

  addCommands() {
    return {
      insertTemplateVariable:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false;
          const { $from } = state.selection;
          if (!$from.parent.canReplaceWith($from.index(), $from.index(), this.type)) {
            return false;
          }
          if (dispatch) {
            window.dispatchEvent(
              new CustomEvent<TemplateVariableEventDetail>(TEMPLATE_VARIABLE_EVENT, {
                detail: { mode: "insert" },
              }),
            );
          }
          return true;
        },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.className = "lt4-template-variable";
      dom.setAttribute("data-type", node.attrs.fieldType);
      dom.contentEditable = "false";
      dom.textContent = node.attrs.name || "?";
      dom.title = node.attrs.name;
      dom.onclick = () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined || !editor.isEditable) return;
        editor.view.dispatch(
          editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
        );
        window.dispatchEvent(
          new CustomEvent<TemplateVariableEventDetail>(TEMPLATE_VARIABLE_EVENT, {
            detail: { mode: "edit", pos, attrs: { ...node.attrs } },
          }),
        );
      };
      return {
        dom,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          dom.textContent = updated.attrs.name || "?";
          dom.setAttribute("data-type", updated.attrs.fieldType);
          return true;
        },
      };
    };
  },
});
