// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter: Dieses Feature ist im LT4-Fork noch nicht gebaut.
import { ITemplate, TemplateVariableValues } from "../types/template.types";

export async function applyTemplate(_opts: {
  template: ITemplate;
  pageId: string;
  variableValues?: TemplateVariableValues;
}): Promise<ITemplate> {
  throw new Error("Templates are not available yet");
}
