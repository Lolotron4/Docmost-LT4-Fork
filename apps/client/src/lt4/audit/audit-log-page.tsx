// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > Audit-Log: wer hat wann was geändert.
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";
import { formatFullDateTime, timeAgo } from "@/lib/time.ts";
import api from "@/lib/api-client";
import { AUDIT_CATEGORIES, AUDIT_EVENT_LABELS } from "./audit-labels";

type AuditEntry = {
  id: string;
  event: string;
  resourceType: string;
  resourceId: string | null;
  spaceId: string | null;
  spaceName: string | null;
  actorType: string;
  actor: { id: string; name: string | null; avatarUrl: string | null } | null;
  metadata: Record<string, any> | null;
  changes: { before?: Record<string, any>; after?: Record<string, any> } | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type Filters = { event?: string; actorId?: string; from?: string; to?: string };

const post = async <T,>(url: string, body?: unknown) => (await api.post<T>(url, body)).data;

const RETENTION = [30, 90, 180, 365, 730, 1825];

/** Kurzbeschreibung des betroffenen Objekts aus den Metadaten. */
function describe(e: AuditEntry): string {
  const m = e.metadata ?? {};
  const after = e.changes?.after ?? {};
  const before = e.changes?.before ?? {};
  return (
    m.pageTitle ||
    m.title ||
    m.userName ||
    m.groupName ||
    m.name ||
    m.spaceName ||
    m.groupName ||
    m.fileName ||
    after.title ||
    before.title ||
    after.name ||
    before.name ||
    m.email ||
    ""
  );
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({});
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const { data: members } = useWorkspaceMembersQuery({ limit: 100 });

  const { data: events = [] } = useQuery({
    queryKey: ["lt4-audit-events"],
    queryFn: () => post<string[]>("/audit-logs/events"),
    enabled: isAdmin,
  });
  const { data: settings } = useQuery({
    queryKey: ["lt4-audit-settings"],
    queryFn: () => post<{ retentionDays: number }>("/audit-logs/settings"),
    enabled: isAdmin,
  });

  const query = useInfiniteQuery({
    queryKey: ["lt4-audit", filters],
    queryFn: ({ pageParam }) =>
      post<{ items: AuditEntry[]; nextCursor: string | null }>("/audit-logs", {
        ...filters,
        from: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : undefined,
        to: filters.to ? new Date(filters.to + "T23:59:59").toISOString() : undefined,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: isAdmin,
  });

  const label = (event: string) => t(AUDIT_EVENT_LABELS[event] ?? event);

  const eventOptions = useMemo(
    () => [
      {
        group: t("Categories"),
        items: AUDIT_CATEGORIES.map((c) => ({ value: c.value, label: t(c.label) })),
      },
      {
        group: t("Events"),
        items: events.map((e) => ({ value: e, label: label(e) })),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, t],
  );

  if (!isAdmin) return <Navigate to="/settings/account/profile" replace />;

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const changeRetention = async (value: string | null) => {
    if (!value) return;
    try {
      await post("/audit-logs/settings/update", { days: Number(value) });
      queryClient.invalidateQueries({ queryKey: ["lt4-audit-settings"] });
      notifications.show({ message: t("Audit retention updated") });
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message ?? "Error", color: "red" });
    }
  };

  const retentionLabel = (d: number) =>
    d % 365 === 0
      ? t("{{count}} years", { count: d / 365 })
      : t("{{count}} days", { count: d });

  return (
    <>
      <DocumentTitle title={t("Audit log")} />
      <SettingsTitle title={t("Audit log")} />
      <Text size="sm" c="dimmed" mb="md">
        {t("See who changed what and when in this workspace, for example sign-ins, new members, deleted pages or changed permissions.")}
      </Text>

      <Group gap="sm" mb="md" align="flex-end">
        <Select
          label={t("Event")}
          placeholder={t("All events")}
          data={eventOptions}
          value={filters.event ?? null}
          onChange={(v) => setFilters((f) => ({ ...f, event: v ?? undefined }))}
          clearable
          searchable
          w={240}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label={t("Person")}
          placeholder={t("Everyone")}
          data={(members?.items ?? []).map((m) => ({ value: m.id, label: m.name }))}
          value={filters.actorId ?? null}
          onChange={(v) => setFilters((f) => ({ ...f, actorId: v ?? undefined }))}
          clearable
          searchable
          w={200}
          comboboxProps={{ withinPortal: true }}
        />
        <TextInput
          type="date"
          label={t("From")}
          value={filters.from ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.currentTarget.value || undefined }))}
          w={150}
        />
        <TextInput
          type="date"
          label={t("To")}
          value={filters.to ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.currentTarget.value || undefined }))}
          w={150}
        />
      </Group>

      <Card withBorder padding={0} radius="md">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs" miw={700}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Time")}</Table.Th>
                <Table.Th>{t("Person")}</Table.Th>
                <Table.Th>{t("Event")}</Table.Th>
                <Table.Th>{t("Details")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((e) => (
                <Table.Tr key={e.id} style={{ cursor: "pointer" }} onClick={() => setSelected(e)}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>
                    <Tooltip label={formatFullDateTime(new Date(e.createdAt))} withArrow>
                      <Text size="sm">{timeAgo(new Date(e.createdAt))}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    {e.actor ? (
                      <Group gap={8} wrap="nowrap">
                        <CustomAvatar avatarUrl={e.actor.avatarUrl ?? undefined} name={e.actor.name ?? ""} size={22} />
                        <Text size="sm" truncate maw={160}>
                          {e.actor.name}
                        </Text>
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {e.actorType === "api_key" ? t("API key") : t("System")}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{label(e.event)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" truncate maw={280}>
                      {[...new Set([describe(e), e.spaceName].filter(Boolean))].join(" · ")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        {query.isLoading && (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        )}
        {!query.isLoading && items.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {t("No entries found")}
          </Text>
        )}
      </Card>
      {query.hasNextPage && (
        <Group justify="center" mt="sm">
          <Button variant="default" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
            {t("Load more")}
          </Button>
        </Group>
      )}

      <Card withBorder radius="md" mt="xl" padding="md">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fw={500}>{t("Retention")}</Text>
            <Text size="sm" c="dimmed">
              {t("Logs older than this period are automatically deleted.")}
            </Text>
          </div>
          <Select
            w={160}
            data={RETENTION.map((d) => ({ value: String(d), label: retentionLabel(d) }))}
            value={settings ? String(settings.retentionDays) : null}
            onChange={changeRetention}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
      </Card>

      <Modal opened={!!selected} onClose={() => setSelected(null)} title={selected ? label(selected.event) : ""} size="lg">
        {selected && (
          <Stack gap="xs">
            <Group gap="xs">
              <Badge variant="light" style={{ textTransform: "none" }}>
                {selected.event}
              </Badge>
              <Text size="sm" c="dimmed">
                {formatFullDateTime(new Date(selected.createdAt))}
              </Text>
            </Group>
            <Text size="sm">
              {t("Person")}: {selected.actor?.name ?? t("System")}
            </Text>
            {selected.spaceName && (
              <Text size="sm">
                {t("Space")}: {selected.spaceName}
              </Text>
            )}
            {selected.ipAddress && (
              <Text size="sm">
                {t("IP address")}: {selected.ipAddress}
              </Text>
            )}
            {selected.userAgent && (
              <Text size="xs" c="dimmed">
                {selected.userAgent}
              </Text>
            )}
            {selected.changes && (
              <>
                <Text size="sm" fw={500} mt="xs">
                  {t("Changes")}
                </Text>
                <Code block>{JSON.stringify(selected.changes, null, 2)}</Code>
              </>
            )}
            {selected.metadata && (
              <>
                <Text size="sm" fw={500} mt="xs">
                  {t("Metadata")}
                </Text>
                <Code block>{JSON.stringify(selected.metadata, null, 2)}</Code>
              </>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
