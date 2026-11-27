// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { Menu, Tooltip } from "@mantine/core";
import { IconCloudDownload, IconCloudCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useSpaceQuery } from "@/features/space/queries/space-query.ts";
import { useExportDisabled } from "@/lt4/security/hooks/use-export-disabled.ts";
import {
  canStoreOffline,
  getOfflinePage,
  onOfflineChanged,
  removeOfflinePage,
  saveOfflinePage,
  setOfflinePinned,
  type OfflinePageSource,
} from "./offline-store";

/**
 * Darf diese Seite auf dem Gerät gespeichert werden?
 * Nein, wenn Export im Workspace oder im Bereich gesperrt ist ("Bereich sperren").
 */
function useOfflineAllowed(page?: OfflinePageSource | null) {
  const spaceSlug = page?.space?.slug ?? "";
  const { isSuccess } = useSpaceQuery(spaceSlug);
  const { exportDisabled, exportDisabledLabel } = useExportDisabled(spaceSlug);
  return {
    ready: !!page && isSuccess,
    allowed: canStoreOffline(page) && !exportDisabled,
    reason: exportDisabled ? exportDisabledLabel : null,
  };
}

/** Unsichtbar: merkt sich jede geöffnete Seite für das Offline-Lesen. */
export function OfflineSnapshot({ page }: { page: OfflinePageSource }) {
  const user = useAtomValue(userAtom);
  const { ready, allowed } = useOfflineAllowed(page);
  useEffect(() => {
    if (!user?.id || !ready || !navigator.onLine) return;
    if (allowed) {
      saveOfflinePage(user.id, page);
    } else if (!page.isBase) {
      // Export inzwischen gesperrt: vorhandene Kopie entfernen.
      removeOfflinePage(user.id, page.id);
    }
    // Neu speichern, wenn sich der Inhalt vom Server ändert.
  }, [user?.id, ready, allowed, page?.id, page?.updatedAt, page?.content]);
  return null;
}

/** Menüpunkt im Seitenmenü: Seite dauerhaft offline verfügbar machen. */
export function OfflineMenuItem({ page }: { page?: OfflinePageSource | null }) {
  const { t } = useTranslation();
  const user = useAtomValue(userAtom);
  const { allowed, reason } = useOfflineAllowed(page);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!user?.id || !page?.id) return;
    let active = true;
    const load = () =>
      getOfflinePage(user.id, page.id).then((p) => active && setPinned(!!p?.pinned));
    load();
    const off = onOfflineChanged(load);
    return () => {
      active = false;
      off();
    };
  }, [user?.id, page?.id]);

  if (!page || page.isBase) return null;

  const toggle = async () => {
    if (!user?.id || !allowed) return;
    const next = !pinned;
    await setOfflinePinned(user.id, page, next);
    setPinned(next);
    notifications.show({
      message: next
        ? t("Page is available offline on this device")
        : t("Page is no longer kept offline"),
    });
  };

  return (
    <Tooltip label={reason} disabled={allowed || !reason} position="left" withArrow>
      <Menu.Item
        leftSection={pinned ? <IconCloudCheck size={16} /> : <IconCloudDownload size={16} />}
        onClick={allowed ? toggle : undefined}
        data-disabled={!allowed || undefined}
        aria-disabled={!allowed || undefined}
      >
        {pinned ? t("Remove from offline") : t("Make available offline")}
      </Menu.Item>
    </Tooltip>
  );
}
