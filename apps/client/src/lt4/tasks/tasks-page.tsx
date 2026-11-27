// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Übersicht "Meine Aufgaben": zugewiesene Checkboxen aus allen Seiten, nach Fälligkeit sortiert.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Card,
  Checkbox,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCalendarDue, IconChecklist, IconFileText } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  DueGroup,
  dueGroup,
  formatDue,
  ITask,
  TaskMode,
  TaskStatus,
  useSetTaskChecked,
  useTasks,
} from "./task-service";

const GROUPS: { key: DueGroup; label: string; color: string }[] = [
  { key: "overdue", label: "Overdue", color: "red" },
  { key: "today", label: "Due today", color: "orange" },
  { key: "tomorrow", label: "Due tomorrow", color: "yellow" },
  { key: "week", label: "Next 7 days", color: "blue" },
  { key: "later", label: "Later", color: "gray" },
  { key: "none", label: "No due date", color: "gray" },
];

function TaskRow({ task, mode }: { task: ITask; mode: TaskMode }) {
  const { t, i18n } = useTranslation();
  const setChecked = useSetTaskChecked();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? task.checked;
  const group = dueGroup(task.dueDate);
  const meta = GROUPS.find((g) => g.key === group)!;
  const pageUrl = buildPageUrl(task.spaceSlug, task.pageSlugId, task.pageTitle ?? undefined);

  return (
    <Card withBorder padding="sm" radius="md">
      <Group wrap="nowrap" align="flex-start" gap="sm">
        <Tooltip label={checked ? t("Mark as not done") : t("Mark as done")} withArrow>
          <Checkbox
            mt={2}
            checked={checked}
            disabled={setChecked.isPending}
            aria-label={t("Done")}
            onChange={(e) => {
              const value = e.currentTarget.checked;
              setOptimistic(value);
              setChecked.mutate(
                { id: task.id, checked: value },
                { onError: () => setOptimistic(null) },
              );
            }}
          />
        </Tooltip>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text
            component={Link}
            to={pageUrl}
            fw={500}
            c={checked ? "dimmed" : "var(--mantine-color-text)"}
            style={{ display: "block", wordBreak: "break-word", textDecoration: checked ? "line-through" : "none" }}
          >
            {task.text || t("Untitled task")}
          </Text>
          <Group gap={6} mt={4} wrap="wrap">
            <Text size="xs" c="dimmed" component={Link} to={pageUrl}>
              <Group gap={4} wrap="nowrap" component="span">
                {task.pageIcon ? <span>{task.pageIcon}</span> : <IconFileText size={13} stroke={1.5} />}
                <span>{task.pageTitle || t("Untitled")}</span>
                <span>· {task.spaceName}</span>
              </Group>
            </Text>
            {mode === "mine" && task.assignedByName && task.assignedById !== task.assigneeId && (
              <Text size="xs" c="dimmed">
                · {t("from {{name}}", { name: task.assignedByName })}
              </Text>
            )}
          </Group>
        </div>
        <Stack gap={6} align="flex-end">
          {task.dueDate && (
            <Badge
              variant={group === "overdue" || group === "today" ? "filled" : "light"}
              color={task.checked ? "gray" : meta.color}
              leftSection={<IconCalendarDue size={12} />}
              style={{ textTransform: "none" }}
            >
              {formatDue(task.dueDate, i18n.resolvedLanguage)}
            </Badge>
          )}
          {mode === "assigned" && (
            <Group gap={6} wrap="nowrap">
              <CustomAvatar avatarUrl={task.assigneeAvatarUrl ?? undefined} name={task.assigneeName ?? ""} size={20} />
              <Text size="xs" c="dimmed" truncate maw={140}>
                {task.assigneeName}
              </Text>
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

export default function TasksPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TaskMode>("mine");
  const [status, setStatus] = useState<TaskStatus>("open");
  const { data, isLoading } = useTasks(mode, status);

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    if (status === "done") return [{ key: "done", label: "Completed", color: "green", items }];
    return GROUPS.map((g) => ({ ...g, items: items.filter((i) => dueGroup(i.dueDate) === g.key) })).filter(
      (g) => g.items.length > 0,
    );
  }, [data, status]);

  return (
    <Container size={900} py="lg">
      <DocumentTitle title={t("My tasks")} />
      <Title order={3} mb="xs">
        {t("My tasks")}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t(
          "A task is a checkbox on a page that mentions a person with @. A date added with /date in the same line is the due date. You get a reminder the day before and when it is overdue.",
        )}
      </Text>

      <Group justify="space-between" mb="md" gap="sm">
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as TaskMode)}
          data={[
            { value: "mine", label: t("Assigned to me") },
            { value: "assigned", label: t("Assigned by me") },
          ]}
        />
        <SegmentedControl
          value={status}
          onChange={(v) => setStatus(v as TaskStatus)}
          data={[
            { value: "open", label: t("Open") },
            { value: "done", label: t("Completed") },
          ]}
        />
      </Group>

      {isLoading ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : grouped.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconChecklist size={40} stroke={1.2} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">
            {status === "open"
              ? mode === "mine"
                ? t("No open tasks. Well done!")
                : t("You have not assigned any open tasks.")
              : t("No completed tasks yet.")}
          </Text>
        </Stack>
      ) : (
        <Stack gap="lg">
          {grouped.map((g) => (
            <div key={g.key}>
              <Group gap="xs" mb={6}>
                <Text size="sm" fw={600} c={g.key === "overdue" ? "red" : undefined}>
                  {t(g.label)}
                </Text>
                <Badge size="sm" variant="light" color={g.color}>
                  {g.items.length}
                </Badge>
              </Group>
              <Stack gap={6}>
                {g.items.map((task) => (
                  <TaskRow key={task.id} task={task} mode={mode} />
                ))}
              </Stack>
            </div>
          ))}
        </Stack>
      )}
    </Container>
  );
}
