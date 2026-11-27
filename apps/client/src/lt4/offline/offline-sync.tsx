// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { userAtom, workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getPageById } from "@/features/page/services/page-service.ts";
import { getSpaceById } from "@/features/space/services/space-service.ts";
import { useOnlineStatus } from "./use-online-status";
import { listOfflinePages, removeOfflinePage, saveOfflinePage } from "./offline-store";

const REFRESH_AFTER_MS = 10 * 60 * 1000;
let running = false;

/**
 * Hält markierte Seiten aktuell: nach dem Start (und wenn das Netz zurückkommt)
 * werden sie im Hintergrund neu geladen. Seiten ohne Zugriff mehr oder in Bereichen
 * mit gesperrtem Export werden vom Gerät entfernt.
 */
export function OfflineSync() {
  const user = useAtomValue(userAtom);
  const workspace = useAtomValue(workspaceAtom);
  const online = useOnlineStatus();

  useEffect(() => {
    if (!user?.id || !online || running) return;
    const userId = user.id;
    const exportBlocked = workspace?.settings?.export?.disabled === true;
    const timer = setTimeout(async () => {
      running = true;
      try {
        const pages = await listOfflinePages(userId);
        const spaceBlocked = new Map<string, boolean>();
        for (const item of pages) {
          if (!navigator.onLine) break;
          if (exportBlocked) {
            await removeOfflinePage(userId, item.pageId);
            continue;
          }
          if (!item.pinned || Date.now() - item.savedAt < REFRESH_AFTER_MS) continue;
          try {
            const page = await getPageById({ pageId: item.pageId });
            const slug = page.space?.slug ?? "";
            if (slug && !spaceBlocked.has(slug)) {
              const space = await getSpaceById(slug).catch(() => null);
              spaceBlocked.set(slug, space?.settings?.export?.disabled === true);
            }
            if (page.deletedAt || spaceBlocked.get(slug)) {
              await removeOfflinePage(userId, item.pageId);
            } else {
              await saveOfflinePage(userId, page, { viewed: false });
            }
          } catch (err: any) {
            const status = err?.response?.status;
            if (status === 403 || status === 404) {
              await removeOfflinePage(userId, item.pageId);
            }
          }
        }
      } finally {
        running = false;
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [user?.id, online, workspace?.settings?.export?.disabled]);

  return null;
}
