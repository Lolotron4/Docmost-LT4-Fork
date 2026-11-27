// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Anchor, Group, Text } from "@mantine/core";
import { IconCloudOff } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "./use-online-status";

/** Schmaler Hinweis oben, solange keine Verbindung besteht (nicht auf /offline selbst). */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const location = useLocation();
  if (online || location.pathname.startsWith("/offline")) return null;
  return (
    <Group
      role="status"
      justify="center"
      gap="xs"
      px="md"
      py={6}
      wrap="nowrap"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
        background: "var(--mantine-color-orange-light)",
        borderTop: "1px solid var(--mantine-color-orange-light-hover)",
      }}
    >
      <IconCloudOff size={16} />
      <Text size="sm">
        {t("You are offline. Changes are synced once the connection is back.")}{" "}
        <Anchor component={Link} to="/offline" size="sm" fw={500}>
          {t("Read saved pages")}
        </Anchor>
      </Text>
    </Group>
  );
}
