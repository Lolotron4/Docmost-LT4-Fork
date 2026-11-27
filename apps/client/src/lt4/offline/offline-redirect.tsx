// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Navigate, useLocation } from "react-router-dom";
import { extractPageSlugId } from "@/lib";

/**
 * Ohne Verbindung kann die App weder die Sitzung noch die Seite laden:
 * dann auf die Offline-Kopie (falls vorhanden) bzw. die Offline-Liste umleiten.
 */
export function OfflineRedirect({ pageId }: { pageId?: string }) {
  const location = useLocation();
  const match = location.pathname.match(/^\/s\/[^/]+\/p\/([^/?#]+)/);
  const id = pageId ?? (match ? extractPageSlugId(decodeURIComponent(match[1])) : undefined);
  return <Navigate to={id ? `/offline/${id}` : "/offline"} replace />;
}
