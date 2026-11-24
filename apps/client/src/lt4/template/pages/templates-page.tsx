// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Übersicht aller Vorlagen, die der Nutzer sehen darf, mit Anlegen/Suchen/Filtern.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Menu,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconFileText, IconPlus, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import {
  invalidateTemplates,
  useTemplatePermissionsQuery,
  useTemplatesQuery,
} from "../queries/template-query";
import { createTemplate } from "../services/template-service";
import "./template.css";

export default function TemplatesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [query] = useDebouncedValue(search, 250);
  const [filter, setFilter] = useState<string>("all");
  const { data: perms } = useTemplatePermissionsQuery();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const { data, isLoading } = useTemplatesQuery({
    query: query || undefined,
    ...(filter === "workspace"
      ? { scope: "workspace" as const }
      : filter !== "all"
        ? { spaceId: filter }
        : {}),
  });

  const spaceName = (id?: string | null) =>
    id ? (spaces?.items?.find((s) => s.id === id)?.name ?? t("Space")) : null;

  const creatableScopes = useMemo(() => {
    const list: { value: string | null; label: string }[] = [];
    if (perms?.canManageWorkspace) list.push({ value: null, label: t("Whole workspace") });
    for (const s of spaces?.items ?? []) {
      if (perms?.manageableSpaceIds?.includes(s.id)) list.push({ value: s.id, label: s.name });
    }
    return list;
  }, [perms, spaces, t]);

  const filterOptions = useMemo(
    () => [
      { value: "all", label: t("All templates") },
      { value: "workspace", label: t("Whole workspace") },
      ...(spaces?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
    ],
    [spaces, t],
  );

  const create = async (spaceId: string | null) => {
    try {
      const tpl = await createTemplate({ title: "", spaceId, content: { type: "doc", content: [{ type: "paragraph" }] } });
      invalidateTemplates();
      navigate(`/templates/${tpl.id}`);
    } catch (err: any) {
      notifications.show({ message: t(err?.response?.data?.message ?? "Error"), color: "red" });
    }
  };

  const templates = data?.items ?? [];

  return (
    <Container size={900} py="lg">
      <DocumentTitle title={t("Templates")} />
      <Group justify="space-between" mb="md">
        <Title order={3}>{t("Templates")}</Title>
        {creatableScopes.length === 1 && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => create(creatableScopes[0].value)}>
            {t("New template")}
          </Button>
        )}
        {creatableScopes.length > 1 && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button leftSection={<IconPlus size={16} />} rightSection={<IconChevronDown size={14} />}>
                {t("New template")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("Available in")}</Menu.Label>
              {creatableScopes.map((s) => (
                <Menu.Item key={s.value ?? "workspace"} onClick={() => create(s.value)}>
                  {s.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      <Text size="sm" c="dimmed" mb="md">
        {t("Templates are ready-made pages. When creating a page, choose a template and fill in its fields.")}
      </Text>

      <Group mb="md" gap="sm">
        <TextInput
          style={{ flex: 1, minWidth: 200 }}
          leftSection={<IconSearch size={16} />}
          placeholder={t("Search templates")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          w={220}
          data={filterOptions}
          value={filter}
          onChange={(v) => setFilter(v ?? "all")}
          allowDeselect={false}
        />
      </Group>

      {isLoading ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : templates.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconFileText size={40} stroke={1.2} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">{query ? t("No templates found") : t("No templates yet")}</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {templates.map((tpl) => (
            <Card
              key={tpl.id}
              withBorder
              padding="md"
              radius="md"
              component={Link}
              to={`/templates/${tpl.id}`}
              className="lt4-template-card"
            >
              <Group wrap="nowrap" align="flex-start" gap="sm">
                <Text size="xl" lh={1}>
                  {tpl.icon || <IconFileText size={22} stroke={1.5} />}
                </Text>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={500} truncate>
                    {tpl.title || t("Untitled template")}
                  </Text>
                  {tpl.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {tpl.description}
                    </Text>
                  )}
                  <Group gap={6} mt={6}>
                    <Badge size="xs" variant="light" color={tpl.spaceId ? "blue" : "grape"}>
                      {spaceName(tpl.spaceId) ?? t("Whole workspace")}
                    </Badge>
                    {tpl.updatedAt && (
                      <Text size="xs" c="dimmed">
                        {formatDistanceToNow(new Date(tpl.updatedAt), { addSuffix: true })}
                      </Text>
                    )}
                  </Group>
                </div>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
}
