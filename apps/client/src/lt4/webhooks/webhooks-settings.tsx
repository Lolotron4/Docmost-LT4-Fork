// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Webhooks: Benachrichtigungen an Discord (oder andere Dienste)
// bei neuen Seiten, Kommentaren, Seitenprüfungen, Lesebestätigungen ...
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconBrandDiscord,
  IconCheck,
  IconDots,
  IconPlus,
  IconWebhook,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  createWebhook,
  deleteWebhook,
  EVENT_GROUPS,
  EVENT_LABELS,
  IWebhook,
  listWebhooks,
  testWebhook,
  updateWebhook,
  WebhookEvent,
  WebhookType,
} from "./webhook-service";

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

type FormState = {
  name: string;
  type: WebhookType;
  url: string;
  allSpaces: boolean;
  spaceIds: string[];
  events: WebhookEvent[];
  language: "de" | "en";
};

const DEFAULT_EVENTS: WebhookEvent[] = [
  "page.created",
  "comment.created",
  "review.requested",
  "review.approved",
  "review.rejected",
  "read.requested",
];

const emptyForm: FormState = {
  name: "",
  type: "discord",
  url: "",
  allSpaces: true,
  spaceIds: [],
  events: DEFAULT_EVENTS,
  language: "de",
};

export default function WebhooksSettings() {
  const { t } = useTranslation();
  const { can } = useUserRole();
  const allowed = can("webhooks");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<IWebhook | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lt4-webhooks"],
    queryFn: listWebhooks,
    enabled: allowed,
  });

  if (!allowed) return <Navigate to="/settings/account/profile" replace />;

  const items = data?.items ?? [];
  const spaces = data?.spaces ?? [];
  const spaceName = (id: string) => {
    const s = spaces.find((x) => x.id === id);
    return s ? s.name || s.slug : t("Deleted space");
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lt4-webhooks"] });

  const openNew = () => {
    setForm(emptyForm);
    setEditing("new");
  };
  const openEdit = (w: IWebhook) => {
    setForm({
      name: w.name,
      type: w.type,
      url: "",
      allSpaces: !w.spaceIds?.length,
      spaceIds: w.spaceIds ?? [],
      events: w.events,
      language: w.language,
    });
    setEditing(w);
  };

  const toggleEvent = (e: WebhookEvent, on: boolean) =>
    setForm((f) => ({
      ...f,
      events: on ? [...f.events, e] : f.events.filter((x) => x !== e),
    }));

  const save = async () => {
    if (!form.name.trim()) {
      notifications.show({ message: t("Please enter a name."), color: "red" });
      return;
    }
    if (editing === "new" && !form.url.trim()) {
      notifications.show({ message: t("Please enter the webhook URL."), color: "red" });
      return;
    }
    if (!form.allSpaces && form.spaceIds.length === 0) {
      notifications.show({ message: t("Please choose at least one space."), color: "red" });
      return;
    }
    if (form.events.length === 0) {
      notifications.show({ message: t("Please choose at least one event."), color: "red" });
      return;
    }
    setBusy(true);
    const common = {
      name: form.name,
      spaceIds: form.allSpaces ? null : form.spaceIds,
      events: form.events,
      language: form.language,
    };
    try {
      if (editing === "new") {
        const created = await createWebhook({ ...common, type: form.type, url: form.url });
        if (created.secret) setSecret(created.secret);
      } else if (editing) {
        await updateWebhook({
          webhookId: editing.id,
          ...common,
          ...(form.url.trim() ? { url: form.url } : {}),
        });
      }
      setEditing(null);
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (w: IWebhook, enabled: boolean) => {
    try {
      await updateWebhook({ webhookId: w.id, enabled });
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    }
  };

  const test = async (w: IWebhook) => {
    setTesting(w.id);
    try {
      const res = await testWebhook(w.id);
      if (res.ok) {
        notifications.show({ message: t("Test message sent."), color: "green" });
      } else {
        notifications.show({
          title: t("Test message failed"),
          message: `${res.status ?? ""} ${res.error ?? ""}`.trim(),
          color: "red",
        });
      }
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setTesting(null);
      refresh();
    }
  };

  const regenerate = (w: IWebhook) =>
    modals.openConfirmModal({
      title: t("Create new signing secret"),
      children: (
        <Text size="sm">
          {t("The old secret stops working right away. The receiving service must be updated.")}
        </Text>
      ),
      labels: { confirm: t("Create"), cancel: t("Cancel") },
      onConfirm: async () => {
        try {
          const res = await updateWebhook({ webhookId: w.id, regenerateSecret: true });
          if (res.secret) setSecret(res.secret);
          refresh();
        } catch (err) {
          notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
        }
      },
    });

  const remove = (w: IWebhook) =>
    modals.openConfirmModal({
      title: t("Delete webhook"),
      children: (
        <Text size="sm">{t("Are you sure you want to delete the webhook {{name}}?", { name: w.name })}</Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteWebhook(w.id);
          refresh();
        } catch (err) {
          notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
        }
      },
    });

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");

  const status = (w: IWebhook) => {
    if (!w.lastSentAt) {
      return (
        <Text size="xs" c="dimmed">
          {t("Nothing sent yet")}
        </Text>
      );
    }
    if (!w.lastError) {
      return (
        <Group gap={4}>
          <IconCheck size={14} color="var(--mantine-color-green-6)" />
          <Text size="xs" c="dimmed">
            {t("Last sent {{time}}", { time: fmt(w.lastSentAt) })}
          </Text>
        </Group>
      );
    }
    return (
      <Group gap={4} wrap="nowrap">
        <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
        <Text size="xs" c="red" lineClamp={2}>
          {t("Failed {{time}}", { time: fmt(w.lastSentAt) })}: {w.lastStatus ?? ""} {w.lastError}
        </Text>
      </Group>
    );
  };

  return (
    <>
      <DocumentTitle title={t("Webhooks")} />
      <SettingsTitle title={t("Webhooks")} />
      <Text size="sm" c="dimmed" mb="md">
        {t("Send a message to Discord or another service when something happens, for example a new page, a comment or a page review. Pages with restricted access are never reported.")}
      </Text>

      <Group justify="flex-end" mb="md">
        <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
          {t("New webhook")}
        </Button>
      </Group>

      {!isLoading && items.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          {t("No webhooks yet")}
        </Text>
      )}

      <Stack gap="sm">
        {items.map((w) => (
          <Card key={w.id} withBorder padding="sm" radius="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap="xs" mb={4} wrap="nowrap">
                  {w.type === "discord" ? (
                    <IconBrandDiscord size={18} color="#5865F2" style={{ flexShrink: 0 }} />
                  ) : (
                    <IconWebhook size={18} style={{ flexShrink: 0 }} />
                  )}
                  <Text fw={500} truncate>
                    {w.name}
                  </Text>
                  {!w.enabled && (
                    <Badge size="sm" variant="light" color={w.failureCount >= 10 ? "red" : "gray"}>
                      {w.failureCount >= 10 ? t("Turned off after errors") : t("Off")}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" truncate>
                  {w.urlPreview}
                </Text>
                <Group gap={4} mt={6}>
                  <Badge size="sm" variant="outline" color="gray">
                    {w.spaceIds?.length
                      ? w.spaceIds.map(spaceName).join(", ")
                      : t("All spaces")}
                  </Badge>
                  {w.events.map((e) => (
                    <Badge key={e} size="sm" variant="light">
                      {t(EVENT_LABELS[e])}
                    </Badge>
                  ))}
                </Group>
                <div style={{ marginTop: 6 }}>{status(w)}</div>
              </div>
              <Group gap="xs" wrap="nowrap">
                <Switch
                  checked={w.enabled}
                  onChange={(e) => setEnabled(w, e.currentTarget.checked)}
                  aria-label={t("Enabled")}
                />
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label={t("Actions")}>
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => test(w)} disabled={testing === w.id}>
                      {t("Send test message")}
                    </Menu.Item>
                    <Menu.Item onClick={() => openEdit(w)}>{t("Edit")}</Menu.Item>
                    {w.type === "generic" && (
                      <Menu.Item onClick={() => regenerate(w)}>{t("Create new signing secret")}</Menu.Item>
                    )}
                    <Menu.Item color="red" onClick={() => remove(w)}>
                      {t("Delete")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("New webhook") : t("Edit webhook")}
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. Discord #news")}
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            data-autofocus
          />
          {editing === "new" && (
            <SegmentedControl
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v as WebhookType })}
              data={[
                { value: "discord", label: "Discord" },
                { value: "generic", label: t("Other service (JSON)") },
              ]}
            />
          )}
          <TextInput
            label={t("Webhook URL")}
            required={editing === "new"}
            placeholder={
              editing && editing !== "new"
                ? editing.urlPreview
                : form.type === "discord"
                  ? "https://discord.com/api/webhooks/…"
                  : "https://…"
            }
            description={
              editing && editing !== "new"
                ? t("Leave empty to keep the current URL.")
                : form.type === "discord"
                  ? t("In Discord: channel settings > Integrations > Webhooks > New webhook > Copy webhook URL.")
                  : t("Receives a JSON POST request, signed with an HMAC-SHA256 secret (header X-LT4-Signature).")
            }
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.currentTarget.value })}
            autoComplete="off"
          />

          <Radio.Group
            label={t("Spaces")}
            value={form.allSpaces ? "all" : "some"}
            onChange={(v) => setForm({ ...form, allSpaces: v === "all" })}
          >
            <Group mt={4}>
              <Radio value="all" label={t("All spaces")} />
              <Radio value="some" label={t("Selected spaces")} />
            </Group>
          </Radio.Group>
          {!form.allSpaces && (
            <MultiSelect
              data={spaces.map((s) => ({ value: s.id, label: s.name || s.slug }))}
              value={form.spaceIds}
              onChange={(v) => setForm({ ...form, spaceIds: v })}
              placeholder={t("Choose spaces")}
              searchable
              comboboxProps={{ withinPortal: true }}
            />
          )}

          <Text size="sm" fw={500} mt="xs">
            {t("Events")}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {EVENT_GROUPS.map((g) => (
              <Stack key={g.label} gap={6}>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  {t(g.label)}
                </Text>
                {g.items.map((e) => (
                  <Checkbox
                    key={e}
                    label={t(EVENT_LABELS[e])}
                    checked={form.events.includes(e)}
                    onChange={(ev) => toggleEvent(e, ev.currentTarget.checked)}
                    disabled={e === "member.joined" && !form.allSpaces}
                  />
                ))}
              </Stack>
            ))}
          </SimpleGrid>
          {!form.allSpaces && form.events.includes("member.joined") && (
            <Text size="xs" c="dimmed">
              {t("New members are only reported to webhooks for all spaces.")}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {t("New pages are sent about a minute after they are created, so that the title is already there. Several new pages at once are combined into one message.")}
          </Text>

          <Select
            label={t("Message language")}
            data={[
              { value: "de", label: "Deutsch" },
              { value: "en", label: "English" },
            ]}
            value={form.language}
            onChange={(v) => setForm({ ...form, language: (v as "de" | "en") ?? "de" })}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setEditing(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!secret} onClose={() => setSecret(null)} title={t("Signing secret")} size="lg">
        <Stack gap="sm">
          <Alert color="yellow" variant="light">
            {t("Copy the secret now. It will not be shown again.")}
          </Alert>
          <Code block style={{ wordBreak: "break-all" }}>
            {secret}
          </Code>
          <Text size="xs" c="dimmed">
            {t("Each request has the header X-LT4-Signature: sha256=<HMAC-SHA256 of the body with this secret>.")}
          </Text>
          <Group justify="flex-end">
            <CopyButton value={secret ?? ""}>
              {({ copied, copy }) => (
                <Button onClick={copy} color={copied ? "teal" : undefined}>
                  {copied ? t("Copied") : t("Copy")}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
