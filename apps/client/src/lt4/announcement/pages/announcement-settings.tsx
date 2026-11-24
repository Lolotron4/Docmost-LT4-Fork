// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Ankündigungen: Banner anlegen, bearbeiten, archivieren, löschen.
import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { AnnouncementBar } from "../components/announcement-banners";
import {
  AnnouncementAudience,
  AnnouncementColor,
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  IAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "../services/announcement-service";

const COLORS: { value: AnnouncementColor; label: string }[] = [
  { value: "blue", label: "Blue (info)" },
  { value: "green", label: "Green (good news)" },
  { value: "yellow", label: "Yellow (note)" },
  { value: "red", label: "Red (important)" },
  { value: "gray", label: "Gray" },
];

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

/** ISO -> Wert für <input type="datetime-local"> in lokaler Zeit. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

type FormState = {
  title: string;
  text: string;
  color: AnnouncementColor;
  audience: AnnouncementAudience;
  isDismissible: boolean;
  startsAt: string;
  endsAt: string;
};

const emptyForm: FormState = {
  title: "",
  text: "",
  color: "blue",
  audience: "members",
  isDismissible: true,
  startsAt: "",
  endsAt: "",
};

function statusOf(a: IAnnouncement): "active" | "scheduled" | "ended" | "archived" {
  if (a.archivedAt) return "archived";
  const now = Date.now();
  if (new Date(a.startsAt).getTime() > now) return "scheduled";
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return "ended";
  return "active";
}

export default function AnnouncementSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"current" | "archived">("current");
  const [editing, setEditing] = useState<IAnnouncement | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lt4-announcements-admin", view],
    queryFn: () => listAnnouncements(view === "archived"),
    enabled: isAdmin,
  });

  if (!isAdmin) return <Navigate to="/settings/account/profile" replace />;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["lt4-announcements-admin"] });
    queryClient.invalidateQueries({ queryKey: ["lt4-announcements"] });
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditing("new");
  };
  const openEdit = (a: IAnnouncement) => {
    setForm({
      title: a.title,
      text: a.textContent ?? "",
      color: a.color,
      audience: a.audience,
      isDismissible: a.isDismissible,
      startsAt: toLocalInput(a.startsAt),
      endsAt: toLocalInput(a.endsAt),
    });
    setEditing(a);
  };

  const save = async () => {
    if (!form.title.trim()) {
      notifications.show({ message: t("Please enter a title."), color: "red" });
      return;
    }
    setBusy(true);
    const payload = {
      title: form.title,
      text: form.text,
      color: form.color,
      audience: form.audience,
      isDismissible: form.isDismissible,
      ...(form.startsAt ? { startsAt: fromLocalInput(form.startsAt)! } : {}),
      endsAt: fromLocalInput(form.endsAt),
    };
    try {
      if (editing === "new") await createAnnouncement(payload);
      else if (editing) await updateAnnouncement({ announcementId: editing.id, ...payload });
      setEditing(null);
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const archive = async (a: IAnnouncement, archived: boolean) => {
    try {
      await archiveAnnouncement(a.id, archived);
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    }
  };

  const remove = (a: IAnnouncement) =>
    modals.openConfirmModal({
      title: t("Delete announcement"),
      children: <Text size="sm">{t("Are you sure you want to delete this announcement?")}</Text>,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteAnnouncement(a.id);
          refresh();
        } catch (err) {
          notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
        }
      },
    });

  const statusBadge = (a: IAnnouncement) => {
    const s = statusOf(a);
    const map = {
      active: { color: "green", label: t("Active") },
      scheduled: { color: "blue", label: t("Scheduled") },
      ended: { color: "gray", label: t("Ended") },
      archived: { color: "gray", label: t("Archived") },
    } as const;
    return (
      <Badge size="sm" variant="light" color={map[s].color}>
        {map[s].label}
      </Badge>
    );
  };

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");

  return (
    <>
      <DocumentTitle title={t("Announcements")} />
      <SettingsTitle title={t("Announcements")} />
      <Text size="sm" c="dimmed" mb="md">
        {t("Announcements appear as a bar at the top for everyone in the workspace, for example for maintenance, deadlines or news.")}
      </Text>

      <Group justify="space-between" mb="md">
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as "current" | "archived")}
          data={[
            { value: "current", label: t("Current") },
            { value: "archived", label: t("Archived") },
          ]}
        />
        <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
          {t("New announcement")}
        </Button>
      </Group>

      {!isLoading && items.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          {view === "archived" ? t("No archived announcements") : t("No announcements yet")}
        </Text>
      )}

      <Stack gap="sm">
        {items.map((a) => (
          <Card key={a.id} withBorder padding="sm" radius="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap="xs" mb={4}>
                  {statusBadge(a)}
                  <Badge size="sm" variant="outline" color="gray">
                    {a.audience === "everyone" ? t("Everyone, also on the login page") : t("Signed-in members")}
                  </Badge>
                </Group>
                <AnnouncementBar announcement={a} />
                <Text size="xs" c="dimmed" mt={6}>
                  {t("From {{start}}", { start: fmt(a.startsAt) })}
                  {a.endsAt ? ` · ${t("until {{end}}", { end: fmt(a.endsAt) })}` : ""}
                  {a.creatorName ? ` · ${a.creatorName}` : ""}
                </Text>
              </div>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label={t("Actions")}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => openEdit(a)}>{t("Edit")}</Menu.Item>
                  {a.archivedAt ? (
                    <Menu.Item onClick={() => archive(a, false)}>{t("Restore")}</Menu.Item>
                  ) : (
                    <Menu.Item onClick={() => archive(a, true)}>{t("Archive")}</Menu.Item>
                  )}
                  <Menu.Item color="red" onClick={() => remove(a)}>
                    {t("Delete")}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Card>
        ))}
      </Stack>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("New announcement") : t("Edit announcement")}
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            label={t("Title")}
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.currentTarget.value })}
            data-autofocus
          />
          <Textarea
            label={t("Text (optional)")}
            autosize
            minRows={2}
            maxLength={2000}
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.currentTarget.value })}
            description={t("Links starting with https:// become clickable.")}
          />
          <Group grow>
            <Select
              label={t("Color")}
              data={COLORS.map((c) => ({ value: c.value, label: t(c.label) }))}
              value={form.color}
              onChange={(v) => setForm({ ...form, color: (v as AnnouncementColor) ?? "blue" })}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
            <Select
              label={t("Shown to")}
              data={[
                { value: "members", label: t("Signed-in members") },
                { value: "everyone", label: t("Everyone, also on the login page") },
              ]}
              value={form.audience}
              onChange={(v) => setForm({ ...form, audience: (v as AnnouncementAudience) ?? "members" })}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
          <Group grow>
            <TextInput
              type="datetime-local"
              label={t("Start (optional)")}
              description={t("Empty means right away")}
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.currentTarget.value })}
            />
            <TextInput
              type="datetime-local"
              label={t("End (optional)")}
              description={t("Empty means until archived")}
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.currentTarget.value })}
            />
          </Group>
          <Switch
            label={t("Can be hidden by the reader")}
            checked={form.isDismissible}
            onChange={(e) => setForm({ ...form, isDismissible: e.currentTarget.checked })}
          />
          <Text size="sm" fw={500} mt="xs">
            {t("Preview")}
          </Text>
          <AnnouncementBar
            announcement={{
              title: form.title || t("Title"),
              textContent: form.text,
              color: form.color,
              isDismissible: form.isDismissible,
            }}
            onDismiss={() => {}}
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
    </>
  );
}
