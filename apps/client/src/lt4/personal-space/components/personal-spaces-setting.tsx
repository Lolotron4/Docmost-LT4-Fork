// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Workspace-Einstellung: Dürfen Mitglieder einen persönlichen Bereich anlegen?
import { useState } from "react";
import { Group, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { Feature } from "@/lt4/features";

export default function PersonalSpacesSetting() {
  const { t } = useTranslation();
  const hasFeature = useHasFeature(Feature.PERSONAL_SPACES);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    workspace?.settings?.spaces?.allowPersonal === true,
  );
  const [busy, setBusy] = useState(false);

  if (!hasFeature) return null;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setBusy(true);
    try {
      const updated = await updateWorkspace({ allowPersonalSpaces: value });
      setChecked(value);
      setWorkspace(updated);
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Allow personal spaces")}</Text>
        <Text size="sm" c="dimmed">
          {t("Every member can create one private space that only they can see. Existing personal spaces stay when you turn this off.")}
        </Text>
      </div>
      <Switch
        checked={checked}
        disabled={busy}
        onChange={handleChange}
        aria-label={t("Allow personal spaces")}
      />
    </Group>
  );
}
