// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Menu, Text } from "@mantine/core";
import { IconShieldOff } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { errorMessage, resetMemberMfa } from "../mfa-service";

interface Props {
  userId: string;
  name: string;
  disabled?: boolean;
}

/** Menüpunkt für Admins: 2FA eines Mitglieds zurücksetzen (z. B. Handy verloren). */
export function ResetMemberMfaItem({ userId, name, disabled }: Props) {
  const { t } = useTranslation();

  const open = () =>
    modals.openConfirmModal({
      title: t("Reset two-factor authentication"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "{{name}} can then sign in with just their password and set up two-factor authentication again.",
            { name },
          )}
        </Text>
      ),
      labels: { confirm: t("Reset"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await resetMemberMfa(userId);
          notifications.show({ message: t("Two-factor authentication has been reset") });
        } catch (err) {
          notifications.show({
            message: t(errorMessage(err, "Error")),
            color: "red",
          });
        }
      },
    });

  return (
    <Menu.Item onClick={open} leftSection={<IconShieldOff size={16} />} disabled={disabled}>
      {t("Reset 2FA")}
    </Menu.Item>
  );
}
