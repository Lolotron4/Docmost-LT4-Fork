// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import { Alert, Group, Switch, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { getMfaStatus } from "@/lt4/mfa/mfa-service";

export default function SecuritySettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [busy, setBusy] = useState(false);
  const { data: myMfa } = useQuery({
    queryKey: ["lt4-mfa-status"],
    queryFn: getMfaStatus,
  });

  if (!isAdmin) return <Navigate to="/settings/account/profile" replace />;

  const enforced = !!workspace?.enforceMfa;

  const save = async (value: boolean) => {
    setBusy(true);
    try {
      const updated = await updateWorkspace({ enforceMfa: value });
      setWorkspace(updated);
    } catch (err) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (value: boolean) => {
    if (value && myMfa && !myMfa.isEnabled) {
      modals.openConfirmModal({
        title: t("Enforce two-factor authentication"),
        children: (
          <Text size="sm">
            {t(
              "You have not set up two-factor authentication yourself yet. You will be asked to set it up the next time you sign in.",
            )}
          </Text>
        ),
        labels: { confirm: t("Enforce"), cancel: t("Cancel") },
        onConfirm: () => save(true),
      });
      return;
    }
    save(value);
  };

  return (
    <>
      <DocumentTitle title={t("Security")} />
      <SettingsTitle title={t("Security")} />

      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Enforce two-factor authentication")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "Once enforced, all members must enable two-factor authentication to access the workspace.",
            )}
          </Text>
        </div>
        <Switch
          checked={enforced}
          disabled={busy}
          onChange={(e) => handleChange(e.currentTarget.checked)}
          aria-label={t("Toggle MFA enforcement")}
        />
      </Group>

      <Alert variant="light" mt="lg" icon={<IconInfoCircle size={18} />}>
        {t(
          "Applies from the next sign-in. If a member loses their phone, you can reset their two-factor authentication under Members.",
        )}
      </Alert>
    </>
  );
}
