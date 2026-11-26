// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Übersicht "Abgaben": eigene Aufgaben (als Gruppe), verteilte Abgaben und Details je Abgabe.
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Loader,
  Menu,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconClockHour4,
  IconDots,
  IconExternalLink,
  IconInbox,
  IconLock,
  IconLockOpen,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import "@/lt4/template/pages/template.css";
import {
  deleteAssignment,
  extendSubmissions,
  IAssignmentDetail,
  ISubmission,
  lockSubmissions,
  unlockSubmissions,
  updateAssignment,
} from "./assignment-service";
import {
  CreateAssignmentModal,
  DeadlineModal,
  errorMessage,
  formatDue,
  invalidateAssignments,
  STATE_META,
  SubmissionStateBadge,
  useAssignment,
  useAssignmentOptions,
  useAssignments,
  useAssignmentTodo,
  useRemaining,
} from "./assignment-ui";

type View = "todo" | "mine" | "all";

export default function AssignmentsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selected = params.get("a");
  const [view, setView] = useState<View>((params.get("view") as View) || "todo");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: options } = useAssignmentOptions();
  const canCreate = (options?.spaces?.length ?? 0) > 0;

  const open = (id: string) => setParams({ a: id });

  return (
    <Container size={960} py="lg">
      <DocumentTitle title={t("Assignments")} />
      {selected ? (
        <AssignmentDetail id={selected} onBack={() => setParams({ view: view })} />
      ) : (
        <>
          <Group justify="space-between" mb="xs">
            <Title order={3}>{t("Assignments")}</Title>
            {canCreate && (
              <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
                {t("New assignment")}
              </Button>
            )}
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            {t("Distribute a template to groups. Each group works on its own page until the deadline.")}
          </Text>
          <SegmentedControl
            mb="md"
            value={view}
            onChange={(v) => setView(v as View)}
            data={[
              { value: "todo", label: t("My tasks") },
              { value: "mine", label: t("Distributed by me") },
              ...(options?.canManageAll ? [{ value: "all", label: t("All") }] : []),
            ]}
          />
          {view === "todo" ? <TodoList /> : <AssignmentList scope={view} onOpen={open} />}
        </>
      )}
      <CreateAssignmentModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(a) => open(a.id)}
      />
    </Container>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Stack align="center" py="xl" gap="xs">
      <IconInbox size={40} stroke={1.2} color="var(--mantine-color-dimmed)" />
      <Text c="dimmed">{text}</Text>
    </Stack>
  );
}

function TodoList() {
  const { t } = useTranslation();
  const { data, isLoading } = useAssignmentTodo();
  const remaining = useRemaining();
  if (isLoading) return <Group justify="center" p="xl"><Loader size="sm" /></Group>;
  const items = data?.items ?? [];
  if (!items.length) return <Empty text={t("No assignments for you right now")} />;
  return (
    <Stack gap="xs">
      {items.map((i) => (
        <Card
          key={i.id}
          withBorder
          padding="sm"
          radius="md"
          component={Link}
          to={buildPageUrl(i.spaceSlug, i.pageSlugId, i.pageTitle ?? undefined)}
          className="lt4-template-card"
        >
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text fw={500} truncate>
                {i.title}
              </Text>
              <Text size="xs" c="dimmed">
                {i.spaceName}
                {i.groupName ? ` · ${i.groupName}` : ""}
              </Text>
            </div>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" c={i.state === "open" ? undefined : "dimmed"}>
                {formatDue(i.dueAt)}
                {i.state === "open" && remaining(i.dueAt) ? ` · ${remaining(i.dueAt)}` : ""}
              </Text>
              <SubmissionStateBadge state={i.state} />
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

function AssignmentList({ scope, onOpen }: { scope: "mine" | "all"; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useAssignments(scope);
  if (isLoading) return <Group justify="center" p="xl"><Loader size="sm" /></Group>;
  const items = data?.items ?? [];
  if (!items.length) return <Empty text={t("No assignments yet")} />;
  return (
    <Stack gap="xs">
      {items.map((a) => (
        <Card
          key={a.id}
          withBorder
          padding="sm"
          radius="md"
          className="lt4-template-card"
          style={{ cursor: "pointer" }}
          onClick={() => onOpen(a.id)}
        >
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text fw={500} truncate>
                {a.title}
              </Text>
              <Text size="xs" c="dimmed">
                {a.spaceName}
                {scope === "all" && a.creator?.name ? ` · ${a.creator.name}` : ""}
                {" · "}
                {t("Deadline")} {formatDue(a.dueAt)}
              </Text>
            </div>
            <Group gap={6} wrap="nowrap">
              {(Object.keys(STATE_META) as (keyof typeof STATE_META)[])
                .filter((s) => a.counts[s] > 0)
                .map((s) => (
                  <SubmissionStateBadge key={s} state={s} count={a.counts[s]} />
                ))}
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

function AssignmentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, refetch, error } = useAssignment(id);
  const [checked, setChecked] = useState<string[]>([]);
  const [modal, setModal] = useState<null | { kind: "unlock" | "extend" | "due"; ids: string[]; initial?: string }>(null);
  const [busy, setBusy] = useState(false);

  const subs = data?.submissions ?? [];
  const allChecked = subs.length > 0 && checked.length === subs.length;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      invalidateAssignments();
      await refetch();
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "Error") });
    } finally {
      setBusy(false);
    }
  };

  const selectedSubs = useMemo(() => subs.filter((s) => checked.includes(s.id)), [subs, checked]);

  if (isLoading) return <Group justify="center" p="xl"><Loader size="sm" /></Group>;
  if (error || !data) {
    return (
      <Stack>
        <Anchor onClick={onBack}>{t("Back")}</Anchor>
        <Text c="dimmed">{t("Assignment not found")}</Text>
      </Stack>
    );
  }

  const pageUrl = (s: ISubmission) => buildPageUrl(data.spaceSlug ?? "", s.pageSlugId, s.pageTitle ?? undefined);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t("Remove assignment?"),
      children: (
        <Text size="sm">
          {t("The pages of the groups stay where they are and become editable again. Only the deadline tracking is removed.")}
        </Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(async () => {
          await deleteAssignment(data.id);
          onBack();
        }),
    });

  return (
    <>
      <Group mb="xs" gap="xs">
        <ActionIcon variant="subtle" onClick={onBack} aria-label={t("Back")}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Title order={3} style={{ flex: 1 }}>
          {data.title}
        </Title>
        {data.canManage && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label={t("More")}>
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconClockHour4 size={16} />}
                onClick={() => setModal({ kind: "due", ids: [], initial: data.dueAt })}
              >
                {t("Change deadline for all")}
              </Menu.Item>
              <Menu.Item
                leftSection={data.lockAfterDue ? <IconLockOpen size={16} /> : <IconLock size={16} />}
                onClick={() => run(() => updateAssignment({ assignmentId: data.id, lockAfterDue: !data.lockAfterDue }))}
              >
                {data.lockAfterDue ? t("Do not lock after the deadline") : t("Lock after the deadline")}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
                {t("Remove assignment")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {data.spaceName}
        {" · "}
        {t("Deadline")} <b>{formatDue(data.dueAt)}</b>
        {" · "}
        {data.lockAfterDue ? t("Locked after the deadline") : t("Not locked after the deadline")}
        {data.creator?.name ? ` · ${t("by {{name}}", { name: data.creator.name })}` : ""}
      </Text>
      {data.parentPageSlugId && (
        <Anchor size="sm" component={Link} to={buildPageUrl(data.spaceSlug ?? "", data.parentPageSlugId, data.title)}>
          {t("Open overview page")}
        </Anchor>
      )}
      {data.description && (
        <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>
          {data.description}
        </Text>
      )}

      {data.canManage && (
        <Group mt="md" mb="xs" gap="xs">
          <Text size="sm" c="dimmed">
            {checked.length ? t("{{count}} selected", { count: checked.length }) : t("Select groups for actions on several pages")}
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconLockOpen size={14} />}
            disabled={!selectedSubs.length}
            onClick={() => setModal({ kind: "unlock", ids: checked })}
          >
            {t("Unlock")}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconClockHour4 size={14} />}
            disabled={!selectedSubs.length}
            onClick={() => setModal({ kind: "extend", ids: checked })}
          >
            {t("Extend deadline")}
          </Button>
          <Button
            size="xs"
            variant="light"
            color="gray"
            leftSection={<IconLock size={14} />}
            disabled={!selectedSubs.length}
            loading={busy}
            onClick={() => run(() => lockSubmissions(checked))}
          >
            {t("Lock now")}
          </Button>
        </Group>
      )}

      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {data.canManage && (
                <Table.Th w={36}>
                  <Checkbox
                    aria-label={t("Select all")}
                    checked={allChecked}
                    indeterminate={checked.length > 0 && !allChecked}
                    onChange={() => setChecked(allChecked ? [] : subs.map((s) => s.id))}
                  />
                </Table.Th>
              )}
              <Table.Th>{t("Group")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Deadline")}</Table.Th>
              <Table.Th>{t("Last change")}</Table.Th>
              <Table.Th w={140} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {subs.map((s) => (
              <Table.Tr key={s.id}>
                {data.canManage && (
                  <Table.Td>
                    <Checkbox
                      aria-label={s.target.name ?? ""}
                      checked={checked.includes(s.id)}
                      onChange={(e) =>
                        setChecked((c) => (e.currentTarget.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))
                      }
                    />
                  </Table.Td>
                )}
                <Table.Td>
                  <Anchor component={Link} to={pageUrl(s)} size="sm" fw={500}>
                    {s.target.name ?? t("Unknown")}
                  </Anchor>
                  {s.target.type === "user" && (
                    <Text span size="xs" c="dimmed" ml={4}>
                      ({t("Person")})
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <SubmissionStateBadge state={s.state} />
                  {s.submittedAt && (
                    <Text size="xs" c="dimmed">
                      {formatDue(s.submittedAt)}
                      {s.submittedByName ? ` · ${s.submittedByName}` : ""}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {s.state === "unlocked" ? t("none") : formatDue(s.dueAt)}
                  </Text>
                  {s.hasOwnDue && s.state !== "unlocked" && (
                    <Text size="xs" c="teal">
                      {t("extended")}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatDue(s.pageUpdatedAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label={t("Open page")}>
                      <ActionIcon variant="subtle" onClick={() => navigate(pageUrl(s))}>
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {data.canManage && (s.state === "locked" || s.state === "submitted") && (
                      <Tooltip label={t("Unlock")}>
                        <ActionIcon variant="subtle" onClick={() => setModal({ kind: "unlock", ids: [s.id] })}>
                          <IconLockOpen size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {data.canManage && s.state !== "locked" && s.state !== "submitted" && (
                      <>
                        <Tooltip label={t("Extend deadline")}>
                          <ActionIcon
                            variant="subtle"
                            onClick={() => setModal({ kind: "extend", ids: [s.id], initial: s.dueAt })}
                          >
                            <IconClockHour4 size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t("Lock now")}>
                          <ActionIcon variant="subtle" color="gray" onClick={() => run(() => lockSubmissions([s.id]))}>
                            <IconLock size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <DeadlineModal
        opened={modal?.kind === "unlock"}
        onClose={() => setModal(null)}
        title={t("Unlock pages")}
        description={t("The groups can edit their pages again. With a new deadline they will be locked again afterwards.")}
        allowNone
        confirmLabel={t("Unlock")}
        onConfirm={(d) =>
          run(async () => {
            await unlockSubmissions(modal!.ids, d?.toISOString() ?? null);
            setChecked([]);
          })
        }
      />
      <DeadlineModal
        opened={modal?.kind === "extend"}
        onClose={() => setModal(null)}
        title={t("Extend deadline")}
        description={t("Only for the selected groups. Locked pages are unlocked.")}
        initial={modal?.initial}
        confirmLabel={t("Save")}
        onConfirm={(d) =>
          run(async () => {
            await extendSubmissions(modal!.ids, d!.toISOString());
            setChecked([]);
          })
        }
      />
      <DeadlineModal
        opened={modal?.kind === "due"}
        onClose={() => setModal(null)}
        title={t("Change deadline for all")}
        description={t("Applies to all groups without their own deadline. Pages locked by the deadline are unlocked; handed-in pages stay locked.")}
        initial={modal?.initial}
        confirmLabel={t("Save")}
        onConfirm={(d) => run(() => updateAssignment({ assignmentId: data.id, dueAt: d!.toISOString() }))}
      />
    </>
  );
}

export type { IAssignmentDetail };
