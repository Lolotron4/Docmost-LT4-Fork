// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Sicherheit: Passwortregeln, Papierkorb-Aufbewahrung und
// öffentliches Teilen für den ganzen Workspace.
import { useEffect, useState } from "react";
import { Button, Checkbox, Divider, Group, NumberInput, Select, Stack, Switch, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";

export type PasswordPolicy = {
  minLength: number;
  requireNumber: boolean;
  requireMixedCase: boolean;
  requireSymbol: boolean;
};

export const getPasswordPolicy = async () =>
  (await api.post<PasswordPolicy>("/security-settings/password-policy")).data;

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

function PasswordPolicySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["lt4-password-policy"], queryFn: getPasswordPolicy });
  const [form, setForm] = useState<PasswordPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (!form) return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post<PasswordPolicy>("/security-settings/password-policy/update", form);
      queryClient.setQueryData(["lt4-password-policy"], res.data);
      notifications.show({ message: t("Password rules saved") });
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="sm">
      <div>
        <Title order={4}>{t("Password rules")}</Title>
        <Text size="sm" c="dimmed">
          {t("Apply to new accounts and whenever a password is changed or reset. Existing passwords keep working.")}
        </Text>
      </div>
      <NumberInput
        label={t("Minimum length")}
        min={8}
        max={64}
        w={160}
        value={form.minLength}
        onChange={(v) => setForm({ ...form, minLength: Number(v) || 8 })}
      />
      <Checkbox
        label={t("Must contain a number")}
        checked={form.requireNumber}
        onChange={(e) => setForm({ ...form, requireNumber: e.currentTarget.checked })}
      />
      <Checkbox
        label={t("Must contain upper and lower case letters")}
        checked={form.requireMixedCase}
        onChange={(e) => setForm({ ...form, requireMixedCase: e.currentTarget.checked })}
      />
      <Checkbox
        label={t("Must contain a special character")}
        checked={form.requireSymbol}
        onChange={(e) => setForm({ ...form, requireSymbol: e.currentTarget.checked })}
      />
      <Group>
        <Button onClick={save} loading={busy} disabled={!dirty}>
          {t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}

const TRASH_DAYS = [7, 14, 30, 60, 90, 180, 365];

function DataSection() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [busy, setBusy] = useState(false);

  const update = async (data: Record<string, unknown>, message?: string) => {
    setBusy(true);
    try {
      const updated = await updateWorkspace(data as any);
      setWorkspace(updated);
      if (message) notifications.show({ message });
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const toggleSharing = (disable: boolean) => {
    if (!disable) return update({ disablePublicSharing: false });
    modals.openConfirmModal({
      title: t("Disable public sharing"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to disable public sharing? All existing shared links in this workspace will be deleted.")}
        </Text>
      ),
      labels: { confirm: t("Disable"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => update({ disablePublicSharing: true }),
    });
  };

  const days = workspace?.trashRetentionDays ?? 30;
  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Trash retention")}</Text>
          <Text size="sm" c="dimmed">
            {t("Pages in trash will be permanently deleted after this period.")}
          </Text>
        </div>
        <Select
          w={160}
          data={TRASH_DAYS.map((d) => ({
            value: String(d),
            label: d === 365 ? t("1 year") : t("{{count}} days", { count: d }),
          }))}
          value={String(days)}
          onChange={(v) => v && update({ trashRetentionDays: Number(v) }, t("Trash retention updated"))}
          allowDeselect={false}
          disabled={busy}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Disable public sharing")}</Text>
          <Text size="sm" c="dimmed">
            {t("Nobody in this workspace can share pages publicly. Existing public links are removed.")}
          </Text>
        </div>
        <Switch
          checked={!!workspace?.disablePublicSharing}
          disabled={busy}
          onChange={(e) => toggleSharing(e.currentTarget.checked)}
          aria-label={t("Disable public sharing")}
        />
      </Group>
    </Stack>
  );
}

export function WorkspaceSecuritySections() {
  return (
    <>
      <Divider my="xl" />
      <PasswordPolicySection />
      <Divider my="xl" />
      <DataSection />
    </>
  );
}
