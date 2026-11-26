// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Gemeinsame Bausteine für Abgaben: Abfragen, Status-Abzeichen, Frist-Dialog, Anlegen-Dialog.
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/main.tsx";
import { MultiMemberSelect } from "@/features/space/components/multi-member-select.tsx";
import { useTemplatesQuery } from "@/lt4/template/queries/template-query";
import {
  createAssignment,
  getAssignment,
  getAssignmentOptions,
  getAssignmentPageInfo,
  getAssignmentTodo,
  IAssignmentDetail,
  listAssignments,
  SubmissionState,
} from "./assignment-service";

export const ASSIGNMENT_KEYS = {
  options: ["lt4-assignment-options"],
  list: ["lt4-assignments"],
  detail: ["lt4-assignment"],
  todo: ["lt4-assignment-todo"],
  page: ["lt4-assignment-page"],
};

export function invalidateAssignments() {
  for (const key of Object.values(ASSIGNMENT_KEYS)) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

export const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

export function useAssignmentOptions(enabled = true) {
  return useQuery({
    queryKey: ASSIGNMENT_KEYS.options,
    queryFn: getAssignmentOptions,
    enabled,
    staleTime: 60_000,
  });
}

export function useAssignments(scope: "mine" | "all") {
  return useQuery({
    queryKey: [...ASSIGNMENT_KEYS.list, scope],
    queryFn: () => listAssignments(scope),
  });
}

export function useAssignment(id?: string | null) {
  return useQuery({
    queryKey: [...ASSIGNMENT_KEYS.detail, id],
    queryFn: () => getAssignment(id!),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useAssignmentTodo() {
  return useQuery({ queryKey: ASSIGNMENT_KEYS.todo, queryFn: getAssignmentTodo });
}

export function useAssignmentPageInfo(pageId?: string) {
  return useQuery({
    queryKey: [...ASSIGNMENT_KEYS.page, pageId],
    queryFn: () => getAssignmentPageInfo(pageId!),
    enabled: !!pageId,
    staleTime: 20_000,
    // Frist läuft eventuell während die Seite offen ist ab
    refetchInterval: 60_000,
  });
}

export const STATE_META: Record<SubmissionState, { label: string; color: string }> = {
  open: { label: "Open", color: "blue" },
  submitted: { label: "Submitted", color: "green" },
  locked: { label: "Locked", color: "gray" },
  overdue: { label: "Overdue", color: "orange" },
  unlocked: { label: "Unlocked", color: "teal" },
};

export function SubmissionStateBadge({ state, count }: { state: SubmissionState; count?: number }) {
  const { t } = useTranslation();
  const meta = STATE_META[state];
  return (
    <Badge size="sm" variant="light" color={meta.color}>
      {t(meta.label)}
      {count !== undefined ? ` ${count}` : ""}
    </Badge>
  );
}

export function formatDue(date: string | Date) {
  return dayjs(date).format("DD.MM.YYYY HH:mm");
}

/** Restzeit grob in Worten ("noch 2 Tage", "noch 3 Std."). */
export function useRemaining() {
  const { t } = useTranslation();
  return (date: string | Date) => {
    const ms = new Date(date).getTime() - Date.now();
    if (ms <= 0) return null;
    const min = Math.round(ms / 60000);
    if (min < 60) return t("{{count}} min left", { count: min });
    const h = Math.round(min / 60);
    if (h < 48) return t("{{count}} h left", { count: h });
    return t("{{count}} days left", { count: Math.round(h / 24) });
  };
}

const toPicker = (d: Date) => dayjs(d).format("YYYY-MM-DD HH:mm:ss");
const fromPicker = (v: string | null) => (v ? dayjs(v).toDate() : null);

/** Standardfrist: in einer Woche, 23:59 Uhr. */
const defaultDue = () => dayjs().add(7, "day").hour(23).minute(59).second(0).toDate();

/** Dialog für eine neue Frist (Freischalten, Verlängern, Frist ändern). */
export function DeadlineModal({
  opened,
  onClose,
  title,
  description,
  initial,
  allowNone,
  confirmLabel,
  onConfirm,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  initial?: Date | string | null;
  /** "Ohne Frist" erlauben (Freischalten auf Dauer). */
  allowNone?: boolean;
  confirmLabel: string;
  onConfirm: (dueAt: Date | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const start = initial ? new Date(initial) : null;
    const base = start && start.getTime() > Date.now() ? start : dayjs().add(1, "day").hour(23).minute(59).second(0).toDate();
    setValue(toPicker(base));
    setNone(false);
  }, [opened, initial]);

  const due = fromPicker(value);
  const invalid = !none && (!due || due.getTime() <= Date.now());

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(none ? null : due);
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "Error") });
    } finally {
      setBusy(false);
    }
  };

  const quick = (days: number) => {
    const from = due && due.getTime() > Date.now() ? dayjs(due) : dayjs();
    setValue(toPicker(from.add(days, "day").toDate()));
    setNone(false);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="sm">
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        <DateTimePicker
          label={t("New deadline")}
          value={value}
          onChange={(v) => setValue(v as string | null)}
          valueFormat="DD.MM.YYYY HH:mm"
          disabled={none}
          minDate={dayjs().format("YYYY-MM-DD")}
          popoverProps={{ withinPortal: true }}
          error={!none && due && due.getTime() <= Date.now() ? t("The deadline must be in the future") : null}
        />
        <Group gap={6}>
          {[1, 2, 7].map((d) => (
            <Button key={d} size="compact-xs" variant="default" onClick={() => quick(d)} disabled={none}>
              {t("+{{count}} days", { count: d })}
            </Button>
          ))}
        </Group>
        {allowNone && (
          <Checkbox
            checked={none}
            onChange={(e) => setNone(e.currentTarget.checked)}
            label={t("No deadline (stays editable until locked by hand)")}
          />
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={busy} disabled={invalid}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Dialog: Vorlage an Gruppen verteilen. */
export function CreateAssignmentModal({
  opened,
  onClose,
  onCreated,
  initialTemplateId,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated?: (a: IAssignmentDetail) => void;
  initialTemplateId?: string | null;
}) {
  const { t } = useTranslation();
  const { data: options } = useAssignmentOptions(opened);
  const { data: templates } = useTemplatesQuery({}, opened);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [peopleKey, setPeopleKey] = useState(0);
  const [due, setDue] = useState<string | null>(toPicker(defaultDue()));
  const [lockAfterDue, setLockAfterDue] = useState(true);
  const [allowSubmit, setAllowSubmit] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setTitle("");
    setDescription("");
    setTemplateId(initialTemplateId ?? null);
    setGroupIds([]);
    setPeople([]);
    setPeopleKey((k) => k + 1);
    setDue(toPicker(defaultDue()));
    setLockAfterDue(true);
    setAllowSubmit(true);
  }, [opened, initialTemplateId]);

  useEffect(() => {
    if (opened && !spaceId && options?.spaces?.length) setSpaceId(options.spaces[0].id);
  }, [opened, options, spaceId]);

  // Titel aus der Vorlage übernehmen, solange noch keiner eingegeben ist
  useEffect(() => {
    const tpl = templates?.items?.find((x) => x.id === templateId);
    if (tpl?.title && !title) setTitle(tpl.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  const templateOptions = useMemo(
    () => [
      { value: "", label: t("Empty page") },
      ...(templates?.items ?? []).map((x) => ({
        value: x.id,
        label: `${x.icon ? x.icon + " " : ""}${x.title || t("Untitled template")}`,
      })),
    ],
    [templates, t],
  );

  const groupOptions = (options?.groups ?? []).map((g) => ({
    value: g.id,
    label: `${g.name} (${g.memberCount})`,
  }));

  // Einzelpersonen aus der Mitgliedersuche (Gruppen dort ebenfalls erlaubt)
  const extraGroupIds = people.filter((v) => v.startsWith("group-")).map((v) => v.slice(6));
  const userIds = people.filter((v) => v.startsWith("user-")).map((v) => v.slice(5));
  const allGroupIds = [...new Set([...groupIds, ...extraGroupIds])];
  const targetCount = allGroupIds.length + userIds.length;

  const dueDate = fromPicker(due);
  const canSave = !!title.trim() && !!spaceId && targetCount > 0 && !!dueDate;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const created = await createAssignment({
        title: title.trim(),
        description: description.trim() || null,
        templateId: templateId || null,
        spaceId: spaceId!,
        groupIds: allGroupIds,
        userIds,
        dueAt: dueDate!.toISOString(),
        lockAfterDue,
        allowSubmit,
      });
      invalidateAssignments();
      notifications.show({
        message: t("Assignment distributed to {{count}} groups", { count: created.submissions.length }),
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "Error") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("New assignment")} size="lg" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "Every group gets its own copy of the template. Only the group and you can see and edit it. After the deadline the page becomes read-only for the group.",
          )}
        </Text>
        {options && options.spaces.length === 0 && (
          <Alert color="yellow">{t("You cannot create pages in any space.")}</Alert>
        )}
        <TextInput
          label={t("Title")}
          required
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder={t("e.g. Project: Water cycle")}
          maxLength={200}
        />
        <Textarea
          label={t("Task description")}
          description={t("Shown on the overview page above the group pages")}
          autosize
          minRows={2}
          maxRows={6}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Group grow align="flex-start">
          <Select
            label={t("Template")}
            data={templateOptions}
            value={templateId ?? ""}
            onChange={(v) => setTemplateId(v || null)}
            searchable
            allowDeselect={false}
          />
          <Select
            label={t("Space")}
            required
            data={(options?.spaces ?? []).map((s) => ({ value: s.id, label: s.name }))}
            value={spaceId}
            onChange={(v) => setSpaceId(v as string | null)}
            searchable
            allowDeselect={false}
          />
        </Group>
        <MultiSelect
          label={t("Groups")}
          description={t("Each group gets its own page")}
          data={groupOptions}
          value={groupIds}
          onChange={setGroupIds}
          searchable
          clearable
          placeholder={groupIds.length ? undefined : t("Select groups")}
          nothingFoundMessage={t("No groups found")}
        />
        <div>
          <Text size="sm" fw={500}>
            {t("Individual people (optional)")}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {t("For individual work: each person gets their own page")}
          </Text>
          <MultiMemberSelect key={peopleKey} onChange={setPeople} />
        </div>
        <DateTimePicker
          label={t("Deadline")}
          required
          value={due}
          onChange={(v) => setDue(v as string | null)}
          valueFormat="DD.MM.YYYY HH:mm"
          popoverProps={{ withinPortal: true }}
        />
        <Checkbox
          checked={lockAfterDue}
          onChange={(e) => setLockAfterDue(e.currentTarget.checked)}
          label={t("Lock pages after the deadline (read-only)")}
        />
        <Checkbox
          checked={allowSubmit}
          onChange={(e) => setAllowSubmit(e.currentTarget.checked)}
          label={t("Groups can hand in early (page is locked right away)")}
        />
        <Group justify="space-between" mt="sm">
          <Text size="sm" c="dimmed">
            {targetCount ? t("{{count}} pages will be created", { count: targetCount }) : ""}
          </Text>
          <Group>
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy} disabled={!canSave}>
              {t("Distribute")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
