// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Sicherungen: Datenbank und Anhänge sichern, Zeitplan,
// herunterladen, hochladen und wiederherstellen.
import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconDots,
  IconDownload,
  IconRestore,
  IconTrash,
  IconUpload,
  IconDatabaseExport,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { formatFullDateTime } from "@/lib/time.ts";
import api from "@/lib/api-client";

type BackupKind = "manual" | "scheduled" | "pre-restore" | "uploaded";

type Backup = {
  id: string;
  fileName: string;
  kind: BackupKind;
  createdAt: string;
  originalCreatedAt?: string | null;
  size: number;
  includesFiles: boolean;
  createdBy: string | null;
  postgresVersion: string | null;
  docmostVersion: string | null;
};

type Settings = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hour: number;
  weekday: number;
  timeZone: string;
  keep: number;
  includeFiles: boolean;
  lastScheduledAt: string | null;
  lastError: string | null;
};

type Status = {
  state: "idle" | "backup" | "restore";
  step: string | null;
  startedAt: string | null;
  error: string | null;
  finishedAt: string | null;
  lastAction: "backup" | "restore" | null;
  restartPending: boolean;
};

type Overview = {
  backups: Backup[];
  settings: Settings;
  nextRun: string | null;
  status: Status;
  filesSupported: boolean;
  disk: { free: number | null; total: number | null };
};

const post = async <T,>(url: string, body?: unknown) =>
  (await api.post<T>(url, body)).data as T;

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

function formatSize(n: number | null | undefined) {
  if (n == null) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const KIND_LABEL: Record<BackupKind, { label: string; color: string }> = {
  manual: { label: "Manual", color: "blue" },
  scheduled: { label: "Scheduled", color: "teal" },
  "pre-restore": { label: "Before restore", color: "orange" },
  uploaded: { label: "Uploaded", color: "grape" },
};

const STEP_LABEL: Record<string, string> = {
  database: "Saving database…",
  files: "Packing attachments…",
  archive: "Packing backup…",
  check: "Checking backup…",
  "safety-backup": "Saving current state first…",
  extract: "Unpacking backup…",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export default function BackupSettings() {
  const { t } = useTranslation();
  const { can } = useUserRole();
  const allowed = can("backups");
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [includeFiles, setIncludeFiles] = useState(true);
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [restoreFiles, setRestoreFiles] = useState(true);
  const [understood, setUnderstood] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restartPhase, setRestartPhase] = useState<null | "restarting" | "done">(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lt4-backups"],
    queryFn: () => post<Overview>("/lt4-backups"),
    enabled: allowed,
    refetchInterval: (q) =>
      q.state.data?.status?.state !== "idle" || restoring ? 2000 : false,
  });

  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
  }, [data?.settings, form]);

  const status = data?.status;
  const busy = !!status && status.state !== "idle";
  const prevState = useRef<string | undefined>(undefined);

  // Meldung, wenn eine Sicherung fertig ist
  useEffect(() => {
    if (!status) return;
    if (prevState.current === "backup" && status.state === "idle") {
      if (status.error) {
        notifications.show({ color: "red", message: `${t("Backup failed")}: ${status.error}` });
      } else {
        notifications.show({ message: t("Backup created") });
      }
    }
    prevState.current = status.state;
  }, [status, t]);

  // Wiederherstellung verfolgen: Fehler anzeigen oder auf den Neustart warten
  useEffect(() => {
    if (!restoring || !status) return;
    if (status.state === "idle" && status.lastAction === "restore") {
      if (status.error) {
        setRestoring(false);
        notifications.show({
          color: "red",
          autoClose: false,
          message: `${t("Restore failed. Nothing was changed.")} ${status.error}`,
        });
      } else {
        setRestartPhase("restarting");
      }
    }
  }, [status, restoring, t]);

  // Server nicht erreichbar, während eine Wiederherstellung lief: er startet neu
  useEffect(() => {
    if (restoring && isError && !restartPhase) setRestartPhase("restarting");
  }, [restoring, isError, restartPhase]);

  // Während des Neustarts auf den Server warten, dann neu laden
  useEffect(() => {
    if (restartPhase !== "restarting") return;
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      // erst warten, bis der alte Prozess sicher beendet ist
      if (Date.now() - started > 6000) {
        try {
          const res = await fetch("/api/health/live", { cache: "no-store" });
          if (res.ok) {
            setRestartPhase("done");
            window.location.href = "/";
            return;
          }
        } catch {
          // Server noch nicht da
        }
      }
      setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stopped = true;
    };
  }, [restartPhase]);

  if (!allowed) return <Navigate to="/settings/account/profile" replace />;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lt4-backups"] });

  const createNow = async () => {
    try {
      await post("/lt4-backups/create", { includeFiles });
      prevState.current = "backup";
      refresh();
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "") });
    }
  };

  const saveSchedule = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await post<Overview>("/lt4-backups/settings", {
        enabled: form.enabled,
        frequency: form.frequency,
        hour: form.hour,
        weekday: form.weekday,
        keep: form.keep,
        includeFiles: form.includeFiles,
        timeZone: browserTimeZone(),
      });
      queryClient.setQueryData(["lt4-backups"], res);
      setForm(res.settings);
      notifications.show({ message: t("Schedule saved") });
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "") });
    } finally {
      setSaving(false);
    }
  };

  const remove = (b: Backup) =>
    modals.openConfirmModal({
      title: t("Delete backup"),
      children: (
        <Text size="sm">
          {t("Delete the backup from {{date}}? This cannot be undone.", {
            date: formatFullDateTime(new Date(b.createdAt)),
          })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          const res = await post<Overview>("/lt4-backups/delete", { id: b.id });
          queryClient.setQueryData(["lt4-backups"], res);
        } catch (err) {
          notifications.show({ color: "red", message: t(errorMessage(err) ?? "") });
        }
      },
    });

  const upload = async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    setUploadProgress(0);
    try {
      const res = await api.post<Overview>("/lt4-backups/upload", body, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 0,
        onUploadProgress: (e) =>
          setUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : null),
      });
      queryClient.setQueryData(["lt4-backups"], (res as any).data);
      notifications.show({ message: t("Backup uploaded") });
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "") });
    } finally {
      setUploadProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const openRestore = (b: Backup) => {
    setRestoreTarget(b);
    setRestoreFiles(b.includesFiles);
    setUnderstood(false);
  };

  const startRestore = async () => {
    if (!restoreTarget) return;
    try {
      await post("/lt4-backups/restore", {
        id: restoreTarget.id,
        restoreFiles: restoreTarget.includesFiles && restoreFiles,
        confirm: "RESTORE",
      });
      setRestoring(true);
      setRestoreTarget(null);
      refresh();
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "") });
    }
  };

  const hours = Array.from({ length: 24 }, (_, h) => ({
    value: String(h),
    label: `${String(h).padStart(2, "0")}:00`,
  }));

  const backups = data?.backups ?? [];

  return (
    <>
      <DocumentTitle title={t("Backups")} />
      <SettingsTitle title={t("Backups")} />

      <Text size="sm" c="dimmed" mb="md">
        {t(
          "A backup contains the whole database (all workspaces, pages, members, settings) and, if chosen, all attachments. Backups are stored on the server in the data folder. Download important backups and keep a copy somewhere else.",
        )}
      </Text>

      {data && !data.filesSupported && (
        <Alert color="yellow" mb="md" icon={<IconAlertTriangle size={18} />}>
          {t(
            "Attachments are stored in external storage (S3/Azure) and are not part of these backups. Back them up with your storage provider.",
          )}
        </Alert>
      )}

      {(busy || restoring || restartPhase) && (
        <Alert color="blue" mb="md" icon={<Loader size={18} />}>
          {restartPhase
            ? t("Restore finished. The server is restarting, the page reloads automatically…")
            : t(STEP_LABEL[status?.step ?? ""] ?? "Working…")}
        </Alert>
      )}

      <Card withBorder mb="lg">
        <Group justify="space-between" align="flex-end">
          <Stack gap={4}>
            <Text fw={600}>{t("Create backup")}</Text>
            <Checkbox
              label={t("Include attachments")}
              checked={includeFiles && (data?.filesSupported ?? true)}
              disabled={!data?.filesSupported}
              onChange={(e) => setIncludeFiles(e.currentTarget.checked)}
            />
            {data?.disk?.free != null && (
              <Text size="xs" c="dimmed">
                {t("Free space on the server: {{free}}", { free: formatSize(data.disk.free) })}
              </Text>
            )}
          </Stack>
          <Group>
            <input
              ref={fileInput}
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) upload(f);
              }}
            />
            <Button
              variant="default"
              leftSection={<IconUpload size={16} />}
              loading={uploadProgress !== null}
              disabled={busy || restoring}
              onClick={() => fileInput.current?.click()}
            >
              {uploadProgress !== null && uploadProgress > 0
                ? `${uploadProgress} %`
                : t("Upload backup")}
            </Button>
            <Button
              leftSection={<IconDatabaseExport size={16} />}
              onClick={createNow}
              loading={status?.state === "backup"}
              disabled={busy || restoring}
            >
              {t("Back up now")}
            </Button>
          </Group>
        </Group>
      </Card>

      {form && (
        <Card withBorder mb="lg">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>{t("Automatic backups")}</Text>
              <Switch
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.currentTarget.checked })}
                label={form.enabled ? t("On") : t("Off")}
              />
            </Group>
            <Group grow align="flex-end">
              <Select
                label={t("How often")}
                data={[
                  { value: "daily", label: t("Daily") },
                  { value: "weekly", label: t("Weekly") },
                ]}
                value={form.frequency}
                allowDeselect={false}
                onChange={(v) => setForm({ ...form, frequency: (v as any) ?? "daily" })}
                disabled={!form.enabled}
              />
              {form.frequency === "weekly" && (
                <Select
                  label={t("Day")}
                  data={WEEKDAYS.map((d, i) => ({ value: String(i), label: t(d) }))}
                  value={String(form.weekday)}
                  allowDeselect={false}
                  onChange={(v) => setForm({ ...form, weekday: Number(v ?? 0) })}
                  disabled={!form.enabled}
                />
              )}
              <Select
                label={t("Time")}
                data={hours}
                value={String(form.hour)}
                allowDeselect={false}
                onChange={(v) => setForm({ ...form, hour: Number(v ?? 3) })}
                disabled={!form.enabled}
              />
              <NumberInput
                label={t("Keep")}
                description={t("Number of automatic backups")}
                min={1}
                max={100}
                value={form.keep}
                onChange={(v) => setForm({ ...form, keep: Number(v) || 1 })}
                disabled={!form.enabled}
              />
            </Group>
            <Checkbox
              label={t("Include attachments")}
              checked={form.includeFiles && (data?.filesSupported ?? true)}
              disabled={!form.enabled || !data?.filesSupported}
              onChange={(e) => setForm({ ...form, includeFiles: e.currentTarget.checked })}
            />
            <Text size="xs" c="dimmed">
              {t(
                "Older automatic backups are deleted when there are more than this number. Manual, uploaded and safety backups are never deleted automatically.",
              )}
            </Text>
            {data?.nextRun && form.enabled && (
              <Text size="sm">
                {t("Next backup: {{date}}", { date: formatFullDateTime(new Date(data.nextRun)) })}
              </Text>
            )}
            {data?.settings.lastScheduledAt && (
              <Text size="sm" c="dimmed">
                {t("Last automatic backup: {{date}}", {
                  date: formatFullDateTime(new Date(data.settings.lastScheduledAt)),
                })}
              </Text>
            )}
            {data?.settings.lastError && (
              <Alert color="red" icon={<IconAlertTriangle size={18} />}>
                {t("Last automatic backup failed")}: {data.settings.lastError}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button onClick={saveSchedule} loading={saving}>
                {t("Save")}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      <Text fw={600} mb="xs">
        {t("Backups on the server")}
      </Text>
      {isLoading ? (
        <Loader size="sm" />
      ) : backups.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No backups yet.")}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Date")}</Table.Th>
                <Table.Th>{t("Type")}</Table.Th>
                <Table.Th>{t("Size")}</Table.Th>
                <Table.Th>{t("Content")}</Table.Th>
                <Table.Th>{t("Created by")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {backups.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td>
                    <Text size="sm">{formatFullDateTime(new Date(b.createdAt))}</Text>
                    {b.originalCreatedAt && (
                      <Text size="xs" c="dimmed">
                        {t("Made on {{date}}", {
                          date: formatFullDateTime(new Date(b.originalCreatedAt)),
                        })}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={KIND_LABEL[b.kind]?.color ?? "gray"}>
                      {t(KIND_LABEL[b.kind]?.label ?? b.kind)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatSize(b.size)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip
                      label={[
                        b.postgresVersion && `PostgreSQL ${b.postgresVersion}`,
                        b.docmostVersion && `Docmost ${b.docmostVersion}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || b.fileName}
                    >
                      <Text size="sm">
                        {b.includesFiles
                          ? t("Database and attachments")
                          : t("Database only")}
                      </Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{b.createdBy ?? t("Automatic")}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Tooltip label={t("Download")}>
                        <ActionIcon
                          variant="subtle"
                          component="a"
                          href={`/api/lt4-backups/download/${encodeURIComponent(b.id)}`}
                          download={b.fileName}
                        >
                          <IconDownload size={18} />
                        </ActionIcon>
                      </Tooltip>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" disabled={busy || restoring}>
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconRestore size={16} />}
                            onClick={() => openRestore(b)}
                          >
                            {t("Restore")}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={() => remove(b)}
                          >
                            {t("Delete")}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal
        opened={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        title={t("Restore backup")}
        size="lg"
      >
        {restoreTarget && (
          <Stack>
            <Alert color="red" icon={<IconAlertTriangle size={18} />}>
              {t(
                "All current data is replaced by the state of {{date}}. Everything changed since then is lost (pages, comments, members, settings).",
                { date: formatFullDateTime(new Date(restoreTarget.originalCreatedAt ?? restoreTarget.createdAt)) },
              )}
            </Alert>
            <Text size="sm">
              {t(
                "Before restoring, a safety backup of the current state is created automatically. After restoring, the server restarts and everyone has to sign in again.",
              )}
            </Text>
            <Checkbox
              label={t("Also restore attachments")}
              description={
                restoreTarget.includesFiles
                  ? t("Replaces all uploaded files with the files from the backup.")
                  : t("This backup contains no attachments. Current files stay as they are.")
              }
              checked={restoreTarget.includesFiles && restoreFiles}
              disabled={!restoreTarget.includesFiles || !data?.filesSupported}
              onChange={(e) => setRestoreFiles(e.currentTarget.checked)}
            />
            <Checkbox
              label={t("I understand that the current data will be replaced")}
              checked={understood}
              onChange={(e) => setUnderstood(e.currentTarget.checked)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRestoreTarget(null)}>
                {t("Cancel")}
              </Button>
              <Button
                color="red"
                leftSection={<IconRestore size={16} />}
                disabled={!understood}
                onClick={startRestore}
              >
                {t("Restore now")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
