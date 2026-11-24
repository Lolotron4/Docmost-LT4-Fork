// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Badge, BadgeProps } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconCircleDashed,
  IconEdit,
  IconArrowBackUp,
  IconHourglass,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { VerificationState } from "../services/page-verification-service";

export const STATE_META: Record<
  VerificationState,
  { label: string; color: string; icon: typeof IconCircleCheck }
> = {
  unverified: { label: "Not verified yet", color: "gray", icon: IconCircleDashed },
  verified: { label: "Verified", color: "green", icon: IconCircleCheck },
  expiring: { label: "Review due soon", color: "yellow", icon: IconClock },
  expired: { label: "Verification expired", color: "red", icon: IconAlertTriangle },
  changed: { label: "Changed since review", color: "orange", icon: IconEdit },
  draft: { label: "Draft", color: "gray", icon: IconCircleDashed },
  in_approval: { label: "In approval", color: "blue", icon: IconHourglass },
  approved: { label: "Approved", color: "green", icon: IconCircleCheck },
  rejected: { label: "Returned for revision", color: "red", icon: IconArrowBackUp },
};

export function VerificationStateBadge({
  state,
  ...props
}: { state: VerificationState } & BadgeProps) {
  const { t } = useTranslation();
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <Badge
      variant="light"
      color={meta.color}
      leftSection={<Icon size={12} stroke={2} />}
      style={{ textTransform: "none" }}
      {...props}
    >
      {t(meta.label)}
    </Badge>
  );
}
