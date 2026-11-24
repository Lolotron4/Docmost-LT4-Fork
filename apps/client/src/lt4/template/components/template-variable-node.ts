// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Ohne Vorlagen-Editor reicht der Basis-Knoten, damit vorhandene Inhalte laden.
// Der Einfüge-Befehl kommt mit den Vorlagen (Phase 2a). Bis dahin ist er nur
// deklariert, damit Menüpunkte ihn per `?.()` als nicht verfügbar erkennen.
export { TemplateVariableNode as EditableTemplateVariable } from "@docmost/editor-ext";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lt4TemplateVariable: {
      insertTemplateVariable?: () => ReturnType;
    };
  }
}
