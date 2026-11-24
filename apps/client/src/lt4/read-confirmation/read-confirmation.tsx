// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Lesebestätigung: Hinweisleiste auf der Seite, Menüeintrag und Verwaltungsdialog.
import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Progress,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconChecks, IconEye } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { atom, PrimitiveAtom, useAtom, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/main.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { formatFullDateTime, timeAgo } from "@/lib/time.ts";
import {
  askReadAgain,
  confirmRead,
  getPendingReads,
  getReadInfo,
  getReadStatus,
  IReadConfirmationInfo,
  remindRead,
  removeRead,
  requestRead,
} from "./read-confirmation-service";

export const READ_INFO_KEY = "lt4-read-confirmation";
export const READ_PENDING_KEY = "lt4-read-pending";

/** Seite, deren Verwaltungsdialog offen ist (vom Seitenmenü gesetzt). */
const readModalPageAtom = atom(null as string | null) as PrimitiveAtom<string | null>;

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

function setInfo(info: IReadConfirmationInfo) {
  queryClient.setQueryData([READ_INFO_KEY, info.pageId], info);
  queryClient.invalidateQueries({ queryKey: [READ_PENDING_KEY] });
  queryClient.invalidateQueries({ queryKey: ["lt4-read-status", info.pageId] });
}

export function invalidateReadConfirmation(pageId: string) {
  queryClient.invalidateQueries({ queryKey: [READ_INFO_KEY, pageId] });
  queryClient.invalidateQueries({ queryKey: ["lt4-read-status", pageId] });
  queryClient.invalidateQueries({ queryKey: [READ_PENDING_KEY] });
}

export function useReadInfo(pageId?: string) {
  return useQuery({
    queryKey: [READ_INFO_KEY, pageId],
    queryFn: () => getReadInfo(pageId!),
    enabled: !!pageId,
    staleTime: 30_000,
  });
}

export function usePendingReads() {
  return useQuery({ queryKey: [READ_PENDING_KEY], queryFn: getPendingReads });
}

/** Menüeintrag im Seitenmenü ("..."). */
export function ReadConfirmationMenuItem({ pageId }: { pageId?: string }) {
  const { t } = useTranslation();
  const setOpen = useSetAtom(readModalPageAtom);
  if (!pageId) return null;
  return (
    <Menu.Item leftSection={<IconChecks size={16} />} onClick={() => setOpen(pageId)}>
      {t("Read confirmation")}
    </Menu.Item>
  );
}

/** Hinweisleiste oben auf der Seite; enthält auch den Verwaltungsdialog. */
export function ReadConfirmationBar({ pageId }: { pageId?: string }) {
  const { t } = useTranslation();
  const { data: info } = useReadInfo(pageId);
  const [modalPage, setModalPage] = useAtom(readModalPageAtom);
  const [busy, setBusy] = useState(false);

  if (!pageId) return null;
  const req = info?.request;

  const confirm = async () => {
    setBusy(true);
    try {
      setInfo(await confirmRead(pageId));
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const manageButton = info?.canManage && (
    <Button size="compact-sm" variant="subtle" onClick={() => setModalPage(pageId)}>
      {info.stats
        ? t("{{confirmed}} of {{total}} confirmed", info.stats)
        : t("Manage")}
    </Button>
  );

  let bar: React.ReactNode = null;
  if (req && info?.mustConfirm && !info.myConfirmedAt) {
    const overdue = req.dueAt && new Date(req.dueAt).getTime() < Date.now();
    bar = (
      <Alert color={overdue ? "orange" : "blue"} variant="light" mx="md" mb="sm" icon={<IconEye size={18} />}>
        <Group justify="space-between" wrap="nowrap" align="center">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={500}>
              {t("{{name}} asks you to confirm that you have read this page.", {
                name: req.requestedBy?.name || t("Someone"),
              })}
            </Text>
            {req.message && (
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {req.message}
              </Text>
            )}
            {req.dueAt && (
              <Text size="xs" c={overdue ? "orange" : "dimmed"}>
                {t("Please confirm by {{date}}", { date: formatFullDateTime(new Date(req.dueAt)) })}
              </Text>
            )}
          </div>
          <Group gap="xs" wrap="nowrap">
            {manageButton}
            <Button size="sm" leftSection={<IconChecks size={16} />} loading={busy} onClick={confirm}>
              {t("I have read this")}
            </Button>
          </Group>
        </Group>
      </Alert>
    );
  } else if (req && (info?.myConfirmedAt || info?.canManage)) {
    bar = (
      <Group justify="space-between" mx="md" mb="sm" gap="xs">
        {info?.myConfirmedAt ? (
          <Badge variant="light" color="green" leftSection={<IconChecks size={12} />} style={{ textTransform: "none" }}>
            {t("You confirmed reading {{time}}", { time: timeAgo(new Date(info.myConfirmedAt)) })}
          </Badge>
        ) : (
          <Badge variant="light" color="blue" leftSection={<IconEye size={12} />} style={{ textTransform: "none" }}>
            {t("Read confirmation requested")}
          </Badge>
        )}
        {manageButton}
      </Group>
    );
  }

  return (
    <>
      {bar}
      <ReadConfirmationModal
        pageId={pageId}
        opened={modalPage === pageId}
        onClose={() => setModalPage(null)}
      />
    </>
  );
}

function ReadConfirmationModal({
  pageId,
  opened,
  onClose,
}: {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: info, isLoading } = useReadInfo(opened ? pageId : undefined);
  return (
    <Modal opened={opened} onClose={onClose} title={t("Read confirmation")} size="lg">
      {isLoading || !info ? (
        <Group justify="center" p="lg">
          <Loader size="sm" />
        </Group>
      ) : !info.canManage ? (
        <Text size="sm" c="dimmed">
          {t("Only people who can edit this page can request read confirmations.")}
        </Text>
      ) : !info.request ? (
        <RequestForm pageId={pageId} onDone={() => undefined} onCancel={onClose} />
      ) : (
        <ManageView info={info} onRemoved={onClose} />
      )}
    </Modal>
  );
}

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function RequestForm({
  pageId,
  initial,
  onDone,
  onCancel,
}: {
  pageId: string;
  initial?: { message: string | null; dueAt: string | null };
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(initial?.message ?? "");
  const [due, setDue] = useState(toLocalInput(initial?.dueAt));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await requestRead({
        pageId,
        message: message.trim() || null,
        dueAt: due ? new Date(due).toISOString() : null,
      });
      setInfo(res);
      if (!initial) {
        notifications.show({ message: t("Everyone with access to the page has been notified.") });
      }
      onDone();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="sm">
      {!initial && (
        <Text size="sm" c="dimmed">
          {t("Everyone with access to this page is asked to confirm that they have read it. They get a notification and see a note on the page.")}
        </Text>
      )}
      <Textarea
        label={t("Message (optional)")}
        placeholder={t("e.g. Please read the new server rules.")}
        autosize
        minRows={2}
        maxLength={1000}
        value={message}
        onChange={(e) => setMessage(e.currentTarget.value)}
        data-autofocus
      />
      <TextInput
        type="datetime-local"
        label={t("Confirm by (optional)")}
        value={due}
        onChange={(e) => setDue(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button onClick={save} loading={busy}>
          {initial ? t("Save") : t("Request confirmation")}
        </Button>
      </Group>
    </Stack>
  );
}

function ManageView({ info, onRemoved }: { info: IReadConfirmationInfo; onRemoved: () => void }) {
  const { t } = useTranslation();
  const pageId = info.pageId;
  const req = info.request!;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: status, isLoading } = useQuery({
    queryKey: ["lt4-read-status", pageId],
    queryFn: () => getReadStatus(pageId),
    refetchOnMount: "always",
  });
  useEffect(() => setEditing(false), [req.id]);

  if (editing) {
    return (
      <RequestForm
        pageId={pageId}
        initial={{ message: req.message, dueAt: req.dueAt }}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const items = status?.items ?? [];
  const confirmed = items.filter((i) => i.confirmedAt);
  const open = items.filter((i) => !i.confirmedAt);
  const percent = items.length ? Math.round((confirmed.length / items.length) * 100) : 0;

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(null);
    }
  };

  const remind = () =>
    wrap("remind", async () => {
      const r = await remindRead(pageId);
      notifications.show({ message: t("{{count}} people reminded", { count: r.reminded }) });
    });

  const again = () =>
    modals.openConfirmModal({
      title: t("Ask everyone again?"),
      children: (
        <Text size="sm">
          {t("Use this after important changes. Previous confirmations no longer count, and everyone is notified again.")}
        </Text>
      ),
      labels: { confirm: t("Ask again"), cancel: t("Cancel") },
      onConfirm: () => wrap("again", async () => setInfo(await askReadAgain(pageId))),
    });

  const remove = () =>
    modals.openConfirmModal({
      title: t("End read confirmation"),
      children: <Text size="sm">{t("The note disappears from the page and the confirmations are deleted.")}</Text>,
      labels: { confirm: t("End request"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        wrap("remove", async () => {
          await removeRead(pageId);
          invalidateReadConfirmation(pageId);
          onRemoved();
        }),
    });

  const list = (rows: typeof items) => (
    <ScrollArea.Autosize mah={280}>
      <Stack gap={6} py="xs">
        {rows.map((i) => (
          <Group key={i.user.id} justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <CustomAvatar avatarUrl={i.user.avatarUrl ?? undefined} name={i.user.name ?? ""} size={24} />
              <Text size="sm">{i.user.name}</Text>
            </Group>
            {i.confirmedAt && (
              <Text size="xs" c="dimmed">
                {timeAgo(new Date(i.confirmedAt))}
              </Text>
            )}
          </Group>
        ))}
        {rows.length === 0 && (
          <Text size="sm" c="dimmed">
            {t("Nobody")}
          </Text>
        )}
      </Stack>
    </ScrollArea.Autosize>
  );

  return (
    <Stack gap="sm">
      {req.message && (
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {req.message}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {t("Requested by {{name}} {{time}}", {
          name: req.requestedBy?.name || t("Someone"),
          time: timeAgo(new Date(req.roundStartedAt)),
        })}
        {req.dueAt ? ` · ${t("Confirm by {{date}}", { date: formatFullDateTime(new Date(req.dueAt)) })}` : ""}
      </Text>
      {isLoading ? (
        <Loader size="sm" />
      ) : (
        <>
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              {t("{{confirmed}} of {{total}} confirmed", { confirmed: confirmed.length, total: items.length })}
            </Text>
            <Text size="sm" c="dimmed">
              {percent}%
            </Text>
          </Group>
          <Progress value={percent} color="green" />
          <Tabs defaultValue="open">
            <Tabs.List>
              <Tabs.Tab value="open">{t("Not yet ({{count}})", { count: open.length })}</Tabs.Tab>
              <Tabs.Tab value="done">{t("Confirmed ({{count}})", { count: confirmed.length })}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="open">{list(open)}</Tabs.Panel>
            <Tabs.Panel value="done">{list(confirmed)}</Tabs.Panel>
          </Tabs>
        </>
      )}
      <Group justify="space-between" pt="xs" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
        <Group gap="xs">
          <Button size="compact-sm" variant="light" onClick={remind} loading={busy === "remind"} disabled={open.length === 0}>
            {t("Remind the rest")}
          </Button>
          <Button size="compact-sm" variant="subtle" onClick={again} loading={busy === "again"}>
            {t("Ask again")}
          </Button>
          <Button size="compact-sm" variant="subtle" onClick={() => setEditing(true)}>
            {t("Edit")}
          </Button>
        </Group>
        <Button size="compact-sm" variant="subtle" color="red" onClick={remove} loading={busy === "remove"}>
          {t("End request")}
        </Button>
      </Group>
    </Stack>
  );
}
