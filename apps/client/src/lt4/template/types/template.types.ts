// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export type TemplateVariableValues = Record<string, string>;

export interface ITemplate {
  id: string;
  title: string | null;
  icon?: string | null;
  content?: unknown;
  spaceId?: string | null;
}
