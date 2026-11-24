// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Vorlage auswählen, Variablen ausfüllen und auf eine leere Seite anwenden
// (onUse) oder eine neue Seite im Bereich anlegen.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconFileText, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { queryClient } from "@/main.tsx";
import { useTemplatesQuery } from "../queries/template-query";
import { createPageFromTemplate, getTemplate } from "../services/template-service";
import { templateVariablesOf } from "../template.utils";
import { ITemplate, TemplateVariableValues } from "../types/template.types";
import { templateVariableNameKey } from "@docmost/editor-ext";
import "../pages/template.css";

type Props = {
  opened: boolean;
  onClose: () => void;
  initialSpaceId?: string;
  /** Wenn gesetzt: Vorlage auf die aktuelle (leere) Seite anwenden. */
  onUse?: (template: ITemplate, values?: TemplateVariableValues) => Promise<boolean>;
  parentPageId?: string;
};

export default function TemplatePickerModal({
  opened,
  onClose,
  initialSpaceId,
  onUse,
  parentPageId,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [query] = useDebouncedValue(search, 250);
  const [selected, setSelected] = useState<ITemplate | null>(null);
  const [values, setValues] = useState<TemplateVariableValues>({});
  const [busy, setBusy] = useState(false);
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const emit = useQueryEmit();

  // Bereichs- und Workspace-Vorlagen, die im Zielbereich nutzbar sind
  const { data, isLoading } = useTemplatesQuery(
    { query: query || undefined },
    opened,
  );
  const templates = useMemo(
    () =>
      (data?.items ?? []).filter(
        (tpl) => !tpl.spaceId || !initialSpaceId || tpl.spaceId === initialSpaceId,
      ),
    [data, initialSpaceId],
  );
  const spaceName = (id?: string | null) =>
    id ? spaces?.items?.find((s) => s.id === id)?.name : null;

  const variables = useMemo(() => templateVariablesOf(selected), [selected]);

  useEffect(() => {
    if (!opened) {
      setSelected(null);
      setValues({});
      setSearch("");
    }
  }, [opened]);

  const choose = async (item: ITemplate) => {
    // Die Liste enthält keinen Inhalt; für die Variablen die ganze Vorlage laden
    let tpl = item;
    try {
      tpl = await getTemplate(item.id);
    } catch {
      /* Fallback: ohne Variablen */
    }
    setSelected(tpl);
    const initial: TemplateVariableValues = {};
    for (const v of templateVariablesOf(tpl)) initial[templateVariableNameKey(v.name)] = "";
    setValues(initial);
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (onUse) {
        if (await onUse(selected, values)) onClose();
        return;
      }
      if (!initialSpaceId) return;
      const page = await createPageFromTemplate({
        templateId: selected.id,
        spaceId: initialSpaceId,
        parentPageId,
        variableValues: values,
      });
      const slug = spaces?.items?.find((s) => s.id === initialSpaceId)?.slug;
      await queryClient.refetchQueries({ queryKey: ["root-sidebar-pages", initialSpaceId] });
      emit({ operation: "refetchRootTreeNodeEvent", spaceId: initialSpaceId });
      onClose();
      if (slug) navigate(buildPageUrl(slug, page.slugId, page.title ?? undefined));
    } catch (err: any) {
      notifications.show({
        message: t(err?.response?.data?.message ?? "Failed to load template"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={selected ? selected.title || t("Untitled template") : t("Choose a template")}
    >
      {!selected ? (
        <Stack gap="sm">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder={t("Search templates")}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            data-autofocus
          />
          {isLoading ? (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          ) : templates.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              {query
                ? t("No templates found")
                : t("There are no templates yet. Create one under Templates in the sidebar.")}
            </Text>
          ) : (
            <ScrollArea.Autosize mah={420}>
              <Stack gap={4}>
                {templates.map((tpl) => (
                  <UnstyledButton
                    key={tpl.id}
                    className="lt4-template-pick"
                    onClick={() => choose(tpl)}
                  >
                    <Group wrap="nowrap" gap="sm" align="flex-start">
                      <Text size="lg" lh={1.2}>
                        {tpl.icon || <IconFileText size={20} stroke={1.5} />}
                      </Text>
                      <div style={{ minWidth: 0 }}>
                        <Text fw={500} truncate>
                          {tpl.title || t("Untitled template")}
                        </Text>
                        {tpl.description && (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {tpl.description}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {spaceName(tpl.spaceId) ?? t("Whole workspace")}
                        </Text>
                      </div>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          {selected.description && (
            <Text size="sm" c="dimmed">
              {selected.description}
            </Text>
          )}
          {variables.length > 0 ? (
            <>
              <Text size="sm">{t("Fill in the fields. Empty fields are left out.")}</Text>
              {variables.map((v) => {
                const key = templateVariableNameKey(v.name);
                const set = (value: string) => setValues((prev) => ({ ...prev, [key]: value }));
                if (v.fieldType === "select") {
                  return (
                    <Select
                      key={v.id}
                      label={v.name}
                      data={v.options}
                      value={values[key] || null}
                      onChange={(value) => set(value ?? "")}
                      clearable
                      comboboxProps={{ withinPortal: true }}
                    />
                  );
                }
                if (v.fieldType === "multiline") {
                  return (
                    <Textarea
                      key={v.id}
                      label={v.name}
                      autosize
                      minRows={2}
                      value={values[key] ?? ""}
                      onChange={(e) => set(e.currentTarget.value)}
                    />
                  );
                }
                return (
                  <TextInput
                    key={v.id}
                    label={v.name}
                    value={values[key] ?? ""}
                    onChange={(e) => set(e.currentTarget.value)}
                  />
                );
              })}
            </>
          ) : (
            <Text size="sm">{t("This template has no fields to fill in.")}</Text>
          )}
          <Group justify="space-between" mt="sm">
            <Anchor component="button" size="sm" onClick={() => setSelected(null)}>
              <Group gap={4}>
                <IconArrowLeft size={14} />
                {t("Back")}
              </Group>
            </Anchor>
            <Button onClick={submit} loading={busy}>
              {onUse ? t("Use template") : t("Create page")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
