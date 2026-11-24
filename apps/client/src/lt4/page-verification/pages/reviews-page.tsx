// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Übersicht: Seiten, die auf meine Prüfung warten, und alle geprüften Seiten.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Card,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconFileText, IconRosetteDiscountCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { timeAgo } from "@/lib/time.ts";
import "@/lt4/template/pages/template.css";
import { useVerificationList } from "../queries";
import { STATE_META, VerificationStateBadge } from "../components/verification-state";
import {
  IVerificationListItem,
  VerificationState,
} from "../services/page-verification-service";

/** Was ein Prüfer als Nächstes tun sollte (für "Wartet auf mich"). */
const needsAction = (i: IVerificationListItem) =>
  i.isVerifier && ["in_approval", "expired", "expiring", "changed", "unverified"].includes(i.state);

export default function ReviewsPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<"todo" | "mine" | "all">("todo");
  const [state, setState] = useState<string>("any");
  const { data, isLoading } = useVerificationList({
    filter: view === "all" ? "all" : "mine",
  });

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (view === "todo") list = list.filter(needsAction);
    if (state !== "any") list = list.filter((i) => i.state === state);
    return list;
  }, [data, view, state]);

  const stateOptions = [
    { value: "any", label: t("All states") },
    ...(Object.keys(STATE_META) as VerificationState[]).map((s) => ({
      value: s,
      label: t(STATE_META[s].label),
    })),
  ];

  return (
    <Container size={900} py="lg">
      <DocumentTitle title={t("Reviews")} />
      <Title order={3} mb="xs">
        {t("Reviews")}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t("Pages with a review. Set one up in the page menu under “Page review”.")}
      </Text>

      <Group justify="space-between" mb="md" gap="sm">
        <SegmentedControl
          value={view}
          onChange={(v) => setView(v as typeof view)}
          data={[
            { value: "todo", label: t("Waiting for me") },
            { value: "mine", label: t("My reviews") },
            { value: "all", label: t("All") },
          ]}
        />
        <Select w={220} data={stateOptions} value={state} onChange={(v) => setState(v ?? "any")} allowDeselect={false} />
      </Group>

      {isLoading ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : items.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconRosetteDiscountCheck size={40} stroke={1.2} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">
            {view === "todo" ? t("Nothing is waiting for you.") : t("No pages found")}
          </Text>
        </Stack>
      ) : (
        <Stack gap="xs">
          {items.map((i) => (
            <Card
              key={i.id}
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
                    {i.icon || <IconFileText size={20} stroke={1.5} />}
                  </Text>
                  <div style={{ minWidth: 0 }}>
                    <Text fw={500} truncate>
                      {i.title || t("Untitled")}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {i.spaceName}
                      {i.state === "in_approval" && i.requestedBy && i.requestedAt
                        ? ` · ${t("Submitted by {{name}} {{time}}", { name: i.requestedBy.name, time: timeAgo(new Date(i.requestedAt)) })}`
                        : ` · ${t("Updated {{time}}", { time: timeAgo(new Date(i.updatedAt)) })}`}
                    </Text>
                  </div>
                </Group>
                <Group gap="sm" wrap="nowrap">
                  <Tooltip label={i.verifiers.map((u) => u.name).join(", ")} withArrow>
                    <Avatar.Group spacing="xs">
                      {i.verifiers.slice(0, 3).map((u) => (
                        <CustomAvatar key={u.id} avatarUrl={u.avatarUrl ?? undefined} name={u.name ?? ""} size={24} />
                      ))}
                    </Avatar.Group>
                  </Tooltip>
                  <VerificationStateBadge state={i.state} />
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
