// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Sicherheit: Regeln für öffentliche Links (Gastlinks).
import { useEffect, useState } from "react";
import { Button, Checkbox, Group, NumberInput, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { errorMessage, getShareLinkPolicy, ShareLinkPolicy, updateShareLinkPolicy } from "./share-guard-service";

export function ShareLinkPolicySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["lt4-share-policy"], queryFn: getShareLinkPolicy });
  const [form, setForm] = useState<ShareLinkPolicy | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        requireExpiry: data.requireExpiry,
        maxDays: data.maxDays,
        requirePassword: data.requirePassword,
      });
    }
  }, [data]);
  if (!form || !data) return null;

  const dirty =
    form.requireExpiry !== data.requireExpiry ||
    form.maxDays !== data.maxDays ||
    form.requirePassword !== data.requirePassword;

  const save = async () => {
    setBusy(true);
    try {
      await updateShareLinkPolicy(form);
      await queryClient.invalidateQueries({ queryKey: ["lt4-share-policy"] });
      notifications.show({ message: t("Rules for public links saved") });
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="sm">
      <div>
        <Title order={4}>{t("Public links")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "Rules for new public links. Roles with the right \"Public links without restrictions\" are exempt. Existing links stay as they are.",
          )}
        </Text>
      </div>
      <Checkbox
        label={t("Public links must have an expiry date")}
        checked={form.requireExpiry}
        onChange={(e) => setForm({ ...form, requireExpiry: e.currentTarget.checked })}
      />
      <Group gap="sm" align="flex-end">
        <NumberInput
          label={t("Maximum validity in days")}
          description={t("Empty = no limit")}
          min={1}
          max={3650}
          w={220}
          value={form.maxDays ?? ""}
          onChange={(v) => setForm({ ...form, maxDays: v === "" || v === null ? null : Number(v) || null })}
        />
      </Group>
      <Checkbox
        label={t("Public links must have a password")}
        checked={form.requirePassword}
        onChange={(e) => setForm({ ...form, requirePassword: e.currentTarget.checked })}
      />
      <Group>
        <Button onClick={save} loading={busy} disabled={!dirty}>
          {t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}
