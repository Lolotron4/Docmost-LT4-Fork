// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Workspace-Einstellung: Dürfen normale Mitglieder Vorlagen anlegen?
import { useState } from "react";
import { Group, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { Feature } from "@/lt4/features";
import { invalidateTemplates } from "@/lt4/template/queries/template-query";

export default function AllowMemberTemplates() {
  const { t } = useTranslation();
  const hasTemplates = useHasFeature(Feature.TEMPLATES);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    workspace?.settings?.templates?.allowMemberTemplates === true,
  );
  const [busy, setBusy] = useState(false);

  if (!hasTemplates) return null;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setBusy(true);
    try {
      const updated = await updateWorkspace({ allowMemberTemplates: value });
      setChecked(value);
      setWorkspace(updated);
      invalidateTemplates();
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Members can create templates")}</Text>
        <Text size="sm" c="dimmed">
          {t("If off, only admins (workspace or space) can create and edit templates. Everyone can use them.")}
        </Text>
      </div>
      <Switch
        checked={checked}
        disabled={busy}
        onChange={handleChange}
        aria-label={t("Members can create templates")}
      />
    </Group>
  );
}
