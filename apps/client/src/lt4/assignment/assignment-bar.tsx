// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Hinweisleiste auf einer Abgabe-Seite: Frist, Abgeben, Sperre, Freischalten/Verlängern.
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconLock, IconLockOpen, IconSend, IconClockHour4 } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  extendSubmissions,
  lockSubmissions,
  submitAssignment,
  unlockSubmissions,
} from "./assignment-service";
import {
  DeadlineModal,
  errorMessage,
  formatDue,
  invalidateAssignments,
  useAssignmentPageInfo,
  useRemaining,
} from "./assignment-ui";

export function AssignmentBar({ pageId }: { pageId?: string }) {
  const { t } = useTranslation();
  const { data: info, refetch } = useAssignmentPageInfo(pageId);
  const remaining = useRemaining();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "unlock" | "extend">(null);
  const [needsReload, setNeedsReload] = useState(false);
  const prevState = useRef<string | null>(null);

  const state = info?.submission?.state ?? null;
  // Wurde die Seite wieder freigeschaltet, braucht der Editor ein Neuladen
  useEffect(() => {
    const was = prevState.current;
    if (was && ["locked", "submitted"].includes(was) && state && !["locked", "submitted"].includes(state)) {
      setNeedsReload(true);
    }
    prevState.current = state;
  }, [state]);

  if (!pageId || !info?.assignment || !info.submission) return null;
  const { assignment, submission } = info;
  const sid = submission.id;

  const run = async (fn: () => Promise<unknown>, reload = false) => {
    setBusy(true);
    try {
      await fn();
      invalidateAssignments();
      await refetch();
      if (reload) setNeedsReload(true);
    } catch (err) {
      notifications.show({ color: "red", message: t(errorMessage(err) ?? "Error") });
    } finally {
      setBusy(false);
    }
  };

  const confirmSubmit = () =>
    modals.openConfirmModal({
      title: t("Hand in now?"),
      children: (
        <Text size="sm">
          {t("After handing in, your group can no longer edit this page. Only the teacher can unlock it again.")}
        </Text>
      ),
      labels: { confirm: t("Hand in"), cancel: t("Cancel") },
      onConfirm: () => run(() => submitAssignment(sid)),
    });

  const locked = state === "locked" || state === "submitted";
  const due = formatDue(submission.dueAt);
  const left = remaining(submission.dueAt);
  const who = submission.targetName ?? "";

  let color = "blue";
  let icon = <IconClockHour4 size={18} />;
  let text: string;
  if (state === "submitted") {
    color = "green";
    icon = <IconLock size={18} />;
    text = t("Handed in on {{date}}. The page is read-only now.", {
      date: formatDue(submission.submittedAt!),
    });
  } else if (state === "locked") {
    color = "gray";
    icon = <IconLock size={18} />;
    text = t("The deadline ended on {{date}}. The page is read-only now.", { date: due });
  } else if (state === "overdue") {
    color = "orange";
    text = t("The deadline ended on {{date}}.", { date: due });
  } else if (state === "unlocked") {
    color = "teal";
    icon = <IconLockOpen size={18} />;
    text = t("Unlocked by the teacher, no deadline.");
  } else {
    text = assignment.lockAfterDue
      ? t("Deadline: {{date}} ({{left}}). After that the page becomes read-only.", { date: due, left })
      : t("Deadline: {{date}} ({{left}}).", { date: due, left });
  }

  return (
    <>
      <Alert color={color} variant="light" mx="md" mb="sm" icon={icon}>
        <Group justify="space-between" wrap="wrap" gap="xs" align="center">
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={500}>
              {t("Assignment")}: {assignment.title}
              {who && (
                <Text span size="sm" c="dimmed" fw={400}>
                  {" · "}
                  {who}
                </Text>
              )}
            </Text>
            <Text size="sm">{text}</Text>
          </div>
          <Group gap="xs">
            {needsReload && (
              <Button size="compact-sm" variant="filled" onClick={() => window.location.reload()}>
                {t("Reload to edit")}
              </Button>
            )}
            {info.canSubmit && (
              <Button size="compact-sm" leftSection={<IconSend size={14} />} onClick={confirmSubmit} loading={busy}>
                {t("Hand in")}
              </Button>
            )}
            {info.canManage && locked && (
              <Button size="compact-sm" variant="light" leftSection={<IconLockOpen size={14} />} onClick={() => setModal("unlock")} loading={busy}>
                {t("Unlock")}
              </Button>
            )}
            {info.canManage && !locked && (
              <Button size="compact-sm" variant="subtle" onClick={() => setModal("extend")} loading={busy}>
                {t("Extend deadline")}
              </Button>
            )}
            {info.canManage && !locked && (
              <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconLock size={14} />} onClick={() => run(() => lockSubmissions([sid]))} loading={busy}>
                {t("Lock now")}
              </Button>
            )}
            {info.canManage && (
              <Button size="compact-sm" variant="subtle" component={Link} to={`/assignments?a=${assignment.id}`}>
                {t("All groups")}
              </Button>
            )}
          </Group>
        </Group>
      </Alert>
      <DeadlineModal
        opened={modal === "unlock"}
        onClose={() => setModal(null)}
        title={t("Unlock page")}
        description={t("The group can edit the page again. With a new deadline it will be locked again afterwards.")}
        allowNone
        confirmLabel={t("Unlock")}
        onConfirm={(d) => run(() => unlockSubmissions([sid], d?.toISOString() ?? null))}
      />
      <DeadlineModal
        opened={modal === "extend"}
        onClose={() => setModal(null)}
        title={t("Extend deadline")}
        initial={submission.dueAt}
        confirmLabel={t("Save")}
        onConfirm={async (d) => run(() => extendSubmissions([sid], d!.toISOString()))}
      />
    </>
  );
}
