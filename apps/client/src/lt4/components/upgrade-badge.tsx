// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Badge, BadgeProps, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";

/** Kennzeichnet Funktionen, die im LT4-Fork noch nicht gebaut sind. */
export function UpgradeBadge({
  label,
  ...props
}: BadgeProps & { label?: string | null }) {
  const { t } = useTranslation();
  const badge = (
    <Badge size="xs" variant="light" color="gray" {...props}>
      {t("Soon")}
    </Badge>
  );
  return label ? <Tooltip label={label}>{badge}</Tooltip> : badge;
}
