// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Meldet das Öffnen einer Seite für die Seitenstatistik. Gezählt wird erst,
// wenn die Seite ein paar Sekunden offen ist (kein Zählen beim Durchklicken).
import { useEffect } from "react";
import { recordPageView } from "./page-stats-service";

const DELAY_MS = 3000;

export function usePageViewTracker(pageId?: string | null) {
  useEffect(() => {
    if (!pageId) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      recordPageView(pageId).catch(() => undefined);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [pageId]);
}
