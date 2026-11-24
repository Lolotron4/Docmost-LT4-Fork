// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Kleine Brücke, damit der Slash-Befehl /ki das KI-Menü öffnen kann.
let aiEnabled = false;

export const setAiAssistantEnabled = (value: boolean) => {
  aiEnabled = value;
};

export const isAiAssistantEnabled = () => aiEnabled;

export const AI_OPEN_EVENT = "lt4-ai-open";

export function openAiMenu() {
  window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT));
}
