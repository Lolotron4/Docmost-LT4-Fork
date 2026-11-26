// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Übersicht veralteter Seiten: lange nicht bearbeitet, mit Aufrufen der letzten 90 Tage.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Card,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconClockExclamation, IconEye, IconFileText, IconTable } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { formatFullDateTime, timeAgo } from "@/lib/time.ts";
import "@/lt4/template/pages/template.css";
import { getStalePages, IStalePage } from "./page-stats-service";

const AGE_OPTIONS = ["30", "90", "180", "365", "730"];

export default function StalePagesPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState("180");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const { data, isLoading } = useQuery({
    queryKey: ["lt4-stale-pages", days, spaceId, mine],
    queryFn: () => getStalePages({ days: Number(days), spaceId, mine }),
  });
  const items = data?.items ?? [];

  const ageLabel = (d: string) =>
    d === "365" ? t("1 year") : d === "730" ? t("2 years") : t("{{count}} days", { count: Number(d) });

  return (
    <Container size={900} py="lg">
      <DocumentTitle title={t("Outdated pages")} />
      <Title order={3} mb="xs">
        {t("Outdated pages")}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t("Pages that have not been edited for a long time. Check whether they are still correct, update them or move them to the trash.")}
      </Text>

      <Group mb="md" gap="sm" align="flex-end">
        <Select
          w={200}
          label={t("Not edited for")}
          data={AGE_OPTIONS.map((d) => ({ value: d, label: ageLabel(d) }))}
          value={days}
          onChange={(v) => setDays(v ?? "180")}
          allowDeselect={false}
        />
        <Select
          w={240}
          label={t("Space")}
          placeholder={t("All spaces")}
          clearable
          searchable
          data={(spaces?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={spaceId}
          onChange={(v) => setSpaceId(v ? String(v) : null)}
        />
        <Switch
          mb={8}
          label={t("Only pages I created or edited last")}
          checked={mine}
          onChange={(e) => setMine(e.currentTarget.checked)}
        />
      </Group>

      {isLoading ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : items.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconClockExclamation size={40} stroke={1.2} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">{t("No outdated pages. Everything is up to date.")}</Text>
        </Stack>
      ) : (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {items.length >= 500
              ? t("Showing the 500 oldest pages.")
              : t("{{count}} pages", { count: items.length })}
          </Text>
          {items.map((i) => (
            <StaleRow key={i.id} item={i} />
          ))}
        </Stack>
      )}
    </Container>
  );
}

function StaleRow({ item: i }: { item: IStalePage }) {
  const { t } = useTranslation();
  const updated = new Date(i.updatedAt);
  const ageDays = Math.floor((Date.now() - updated.getTime()) / 86400_000);
  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      component={Link}
      to={buildPageUrl(i.spaceSlug, i.slugId, i.title ?? undefined)}
      className="lt4-template-card"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="lg" lh={1}>
            {i.icon ||
              (i.isBase ? <IconTable size={20} stroke={1.5} /> : <IconFileText size={20} stroke={1.5} />)}
          </Text>
          <div style={{ minWidth: 0 }}>
            <Text fw={500} truncate>
              {i.title || t("Untitled")}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {i.spaceName}
            </Text>
          </div>
        </Group>
        <Group gap="md" wrap="nowrap">
          <Tooltip
            label={
              i.lastViewedAt
                ? t("Last viewed {{time}}", { time: timeAgo(new Date(i.lastViewedAt)) })
                : t("Not viewed yet")
            }
            withArrow
          >
            <Group gap={4} wrap="nowrap" c="dimmed">
              <IconEye size={14} />
              <Text size="xs">{i.views90}</Text>
            </Group>
          </Tooltip>
          {i.lastUpdatedByName && (
            <Tooltip label={t("Last edited by {{name}}", { name: i.lastUpdatedByName })} withArrow>
              <div>
                <CustomAvatar
                  avatarUrl={i.lastUpdatedByAvatarUrl ?? undefined}
                  name={i.lastUpdatedByName}
                  size="sm"
                />
              </div>
            </Tooltip>
          )}
          <Tooltip label={formatFullDateTime(updated)} withArrow>
            <Badge
              variant="light"
              color={ageDays >= 365 ? "red" : ageDays >= 180 ? "orange" : "yellow"}
              style={{ textTransform: "none", minWidth: 110 }}
            >
              {timeAgo(updated)}
            </Badge>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  );
}
