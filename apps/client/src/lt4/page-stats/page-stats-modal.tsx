// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Seitenstatistik: Aufrufe, Lesende, Verlauf. Namen nur mit Rollenrecht "page_stats".
import { ReactNode, useMemo, useState } from "react";
import {
  Alert,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChartBar, IconLock } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { formatFullDateTime, timeAgo } from "@/lib/time.ts";
import { getPageStats, IPageStats, UserRef } from "./page-stats-service";

export function PageStatsMenuItem({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Menu.Item leftSection={<IconChartBar size={16} />} onClick={onClick}>
      {t("Page statistics")}
    </Menu.Item>
  );
}

const PERIODS = ["7", "30", "90", "365"];

export function PageStatsModal({
  pageId,
  opened,
  onClose,
}: {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState("30");
  const { data, isLoading, error } = useQuery({
    queryKey: ["lt4-page-stats", pageId, days],
    queryFn: () => getPageStats(pageId, Number(days)),
    enabled: opened && !!pageId,
    refetchOnMount: "always",
  });

  return (
    <Modal opened={opened} onClose={onClose} title={t("Page statistics")} size="lg">
      <Stack gap="md">
        <SegmentedControl
          value={days}
          onChange={(v) => setDays(String(v))}
          fullWidth
          data={PERIODS.map((d) => ({
            value: d,
            label: d === "365" ? t("1 year") : t("{{count}} days", { count: Number(d) }),
          }))}
        />
        {isLoading ? (
          <Group justify="center" p="lg">
            <Loader size="sm" />
          </Group>
        ) : error || !data ? (
          <Text size="sm" c="dimmed">
            {t("Only people who can edit this page can see its statistics.")}
          </Text>
        ) : (
          <StatsView stats={data} />
        )}
      </Stack>
    </Modal>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700} lh={1.3}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" truncate>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

function StatsView({ stats }: { stats: IPageStats }) {
  const { t } = useTranslation();
  const updated = new Date(stats.updatedAt);
  const ageDays = Math.floor((Date.now() - updated.getTime()) / 86400_000);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Stat label={t("Views")} value={stats.views} />
        <Stat label={t("Readers")} value={stats.viewers} />
        <Stat
          label={t("Last viewed")}
          value={stats.lastViewedAt ? timeAgo(new Date(stats.lastViewedAt)) : "–"}
        />
        <Stat
          label={t("Last edited")}
          value={timeAgo(updated)}
          hint={stats.lastUpdatedBy?.name ?? undefined}
        />
      </SimpleGrid>

      {ageDays >= 180 && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="sm">
            {t("This page has not been edited for {{count}} days. Check if it is still up to date.", {
              count: ageDays,
            })}
          </Text>
        </Alert>
      )}

      <ViewsChart stats={stats} />

      {stats.canSeeNames ? (
        <ReaderLists stats={stats} />
      ) : (
        <Group gap={6} wrap="nowrap">
          <IconLock size={14} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {t("Names of readers are only visible to roles with the right “View page statistics with names”.")}
          </Text>
        </Group>
      )}

      <Text size="xs" c="dimmed">
        {t("A view is counted when someone has the page open for a few seconds; opening it again within 30 minutes counts once. Views are kept for {{count}} days.", {
          count: stats.retentionDays,
        })}
        {stats.allTime.since &&
          " " +
            t("Since {{date}}: {{views}} views by {{viewers}} people.", {
              date: new Date(stats.allTime.since).toLocaleDateString(),
              views: stats.allTime.views,
              viewers: stats.allTime.viewers,
            })}
      </Text>
    </Stack>
  );
}

const dayKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function ViewsChart({ stats }: { stats: IPageStats }) {
  const { t, i18n } = useTranslation();
  const bars = useMemo(() => {
    const byDay = new Map(stats.series.map((s) => [s.day, s]));
    const bucket = stats.days <= 30 ? 1 : stats.days <= 90 ? 7 : 30;
    const out: { label: string; views: number; viewers: number }[] = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (stats.days - 1));
    for (let i = 0; i < stats.days; i += bucket) {
      const from = new Date(start);
      from.setDate(from.getDate() + i);
      let views = 0;
      let viewers = 0;
      let to = from;
      for (let j = 0; j < bucket && i + j < stats.days; j++) {
        to = new Date(start);
        to.setDate(to.getDate() + i + j);
        const s = byDay.get(dayKey(to));
        if (s) {
          views += s.views;
          viewers = Math.max(viewers, s.viewers);
        }
      }
      const fmt = (d: Date) =>
        d.toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
      out.push({
        label: bucket === 1 ? fmt(from) : `${fmt(from)} – ${fmt(to)}`,
        views,
        viewers,
      });
    }
    return out;
  }, [stats, i18n.language]);

  const max = Math.max(1, ...bars.map((b) => b.views));
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>
        {t("Views over time")}
      </Text>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: 110,
          padding: "4px 0",
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        {bars.map((b, i) => (
          <Tooltip
            key={i}
            label={`${b.label}: ${t("{{count}} views", { count: b.views })}`}
            withArrow
            openDelay={100}
          >
            <div
              style={{
                flex: 1,
                height: `${Math.max(b.views ? 4 : 1, (b.views / max) * 100)}%`,
                background: b.views
                  ? "var(--mantine-primary-color-filled)"
                  : "var(--mantine-color-default-border)",
                borderRadius: "3px 3px 0 0",
                minWidth: 2,
              }}
            />
          </Tooltip>
        ))}
      </div>
      <Group justify="space-between" mt={4}>
        <Text size="xs" c="dimmed">
          {bars[0]?.label}
        </Text>
        <Text size="xs" c="dimmed">
          {t("Today")}
        </Text>
      </Group>
    </div>
  );
}

function PersonRow({ user, right }: { user: UserRef; right?: ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" py={4}>
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <CustomAvatar avatarUrl={user.avatarUrl ?? undefined} name={user.name ?? ""} size="sm" />
        <Text size="sm" truncate>
          {user.name || "–"}
        </Text>
      </Group>
      {right}
    </Group>
  );
}

function ReaderLists({ stats }: { stats: IPageStats }) {
  const { t } = useTranslation();
  const readers = stats.readers ?? [];
  const notOpened = stats.notOpened ?? [];
  return (
    <Tabs defaultValue="readers" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="readers">
          {t("Opened")} ({readers.length})
        </Tabs.Tab>
        <Tabs.Tab value="not-opened">
          {t("Not opened")} ({notOpened.length})
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="readers" pt="xs">
        <ScrollArea.Autosize mah={260}>
          {readers.length === 0 ? (
            <Text size="sm" c="dimmed" py="sm">
              {t("Nobody opened this page in this period.")}
            </Text>
          ) : (
            readers.map((r) => (
              <PersonRow
                key={r.user.id}
                user={r.user}
                right={
                  <Tooltip label={formatFullDateTime(new Date(r.lastViewedAt))} withArrow>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {t("{{count}} views", { count: r.views })} · {timeAgo(new Date(r.lastViewedAt))}
                    </Text>
                  </Tooltip>
                }
              />
            ))
          )}
        </ScrollArea.Autosize>
      </Tabs.Panel>
      <Tabs.Panel value="not-opened" pt="xs">
        <ScrollArea.Autosize mah={260}>
          {notOpened.length === 0 ? (
            <Text size="sm" c="dimmed" py="sm">
              {t("Everyone with access opened this page in this period.")}
            </Text>
          ) : (
            notOpened.map((u) => <PersonRow key={u.id} user={u} />)
          )}
        </ScrollArea.Autosize>
      </Tabs.Panel>
    </Tabs>
  );
}
