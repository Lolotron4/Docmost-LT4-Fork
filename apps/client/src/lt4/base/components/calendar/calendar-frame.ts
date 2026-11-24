// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
const DRAG_EVENTS = new Set(["dragstart", "drag", "dragend", "dragenter", "dragover", "dragleave", "drop"]);

/**
 * true für Ziehen von Karten/Terminen innerhalb einer eingebetteten Datenbank.
 * Der Editor soll diese Ereignisse nicht als Verschieben des Blocks behandeln.
 */
export function isCalendarEventDrag(event: Event): boolean {
  if (!DRAG_EVENTS.has(event.type)) return false;
  const target = event.target as Element | null;
  return !!target?.closest?.("[data-lt4-base-drag]");
}
