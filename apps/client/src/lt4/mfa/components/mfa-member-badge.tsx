// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Badge, Tooltip } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function MfaMemberBadge() {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("Two-factor authentication is enabled")} withArrow>
      <Badge variant="light" color="green" leftSection={<IconShieldCheck size={12} />}>
        2FA
      </Badge>
    </Tooltip>
  );
}
