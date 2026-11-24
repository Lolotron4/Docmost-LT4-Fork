// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowsSort,
  IconCalendarMonth,
  IconEye,
  IconFilter,
  IconLayoutKanban,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTable,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import {
  FilterOperator,
  IBase,
  IBaseView,
  IViewConfig,
  IViewFilter,
  ViewType,
} from "../types/base.types";
import { BaseActions } from "../queries/base-query";
import { optionsOf } from "../base.utils";
import classes from "./base.module.css";

const VIEW_ICONS: Record<ViewType, typeof IconTable> = {
  table: IconTable,
  kanban: IconLayoutKanban,
  calendar: IconCalendarMonth,
};

const VIEW_LABELS: Record<ViewType, string> = {
  table: "Table",
  kanban: "Board",
  calendar: "Calendar",
};

interface Props {
  base: IBase;
  view: IBaseView;
  editable: boolean;
  actions: BaseActions;
  onSelectView: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  onNew: () => void;
}

export function ViewToolbar({ base, view, editable, actions, onSelectView, search, onSearch, onNew }: Props) {
  const { t } = useTranslation();
  const setConfig = (patch: Partial<IViewConfig>) =>
    actions.updateView(view.id, { config: { ...view.config, ...patch } });

  const addView = async (type: ViewType) => {
    const config: IViewConfig = {};
    if (type === "kanban") config.groupByPropertyId = base.properties.find((p) => p.type === "select")?.id;
    if (type === "calendar") config.datePropertyId = base.properties.find((p) => p.type === "date")?.id;
    const created = await actions.addView(t(VIEW_LABELS[type]), type, config);
    if (created) onSelectView(created.id);
  };

  return (
    <div className={classes.toolbar}>
      <Group gap={2} wrap="nowrap" style={{ overflowX: "auto", flex: "1 1 auto", minWidth: 0 }}>
        {base.views.map((v) => {
          const Icon = VIEW_ICONS[v.type] ?? IconTable;
          const active = v.id === view.id;
          const tab = (
            <UnstyledButton
              key={v.id}
              className={classes.viewTab}
              data-active={active || undefined}
              onClick={() => onSelectView(v.id)}
            >
              <Icon size={15} />
              {v.name}
            </UnstyledButton>
          );
          if (!active || !editable) return tab;
          return <ViewMenu key={v.id} view={v} base={base} actions={actions} target={tab} onDeleted={() => onSelectView(base.views.find((x) => x.id !== v.id)!.id)} />;
        })}
        {editable && (
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t("Add view")}>
                <IconPlus size={15} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("Add view")}</Menu.Label>
              {(Object.keys(VIEW_ICONS) as ViewType[]).map((type) => {
                const Icon = VIEW_ICONS[type];
                return (
                  <Menu.Item key={type} leftSection={<Icon size={14} />} onClick={() => addView(type)}>
                    {t(VIEW_LABELS[type])}
                  </Menu.Item>
                );
              })}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      <Group gap={4} wrap="nowrap">
        <TextInput
          size="xs"
          w={160}
          leftSection={<IconSearch size={14} />}
          placeholder={t("Search")}
          value={search}
          onChange={(e) => onSearch(e.currentTarget.value)}
          rightSection={
            search ? (
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onSearch("")} aria-label={t("Clear search")}>
                <IconX size={12} />
              </ActionIcon>
            ) : null
          }
        />
        <FilterButton base={base} view={view} onChange={(filters) => setConfig({ filters })} />
        <SortButton base={base} view={view} onChange={(sorts) => setConfig({ sorts })} />
        <PropertiesButton base={base} view={view} onChange={setConfig} />
        {editable && (
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onNew}>
            {t("New")}
          </Button>
        )}
      </Group>
    </div>
  );
}

function ViewMenu({
  view,
  base,
  actions,
  target,
  onDeleted,
}: {
  view: IBaseView;
  base: IBase;
  actions: BaseActions;
  target: React.ReactNode;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(view.name);
  const [opened, setOpened] = useState(false);
  const save = () => {
    const next = name.trim();
    if (next && next !== view.name) actions.updateView(view.id, { name: next });
  };
  return (
    <Menu
      opened={opened}
      onChange={(o) => {
        if (o) setName(view.name);
        else save();
        setOpened(o);
      }}
      position="bottom-start"
      withinPortal
      width={220}
    >
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>
        <div style={{ padding: "4px 6px 6px" }}>
          <TextInput
            size="xs"
            leftSection={<IconPencil size={12} />}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") setOpened(false) as any;
            }}
            aria-label={t("View name")}
          />
        </div>
        {view.type === "kanban" && (
          <div style={{ padding: "0 6px 6px" }}>
            <Select
              size="xs"
              label={t("Group by")}
              comboboxProps={{ withinPortal: false }}
              data={base.properties.filter((p) => p.type === "select").map((p) => ({ value: p.id, label: p.name }))}
              value={view.config.groupByPropertyId ?? null}
              onChange={(v) => v && actions.updateView(view.id, { config: { ...view.config, groupByPropertyId: v } })}
            />
          </div>
        )}
        {view.type === "calendar" && (
          <div style={{ padding: "0 6px 6px" }}>
            <Select
              size="xs"
              label={t("Date property")}
              comboboxProps={{ withinPortal: false }}
              data={base.properties.filter((p) => p.type === "date").map((p) => ({ value: p.id, label: p.name }))}
              value={view.config.datePropertyId ?? null}
              onChange={(v) => v && actions.updateView(view.id, { config: { ...view.config, datePropertyId: v } })}
            />
          </div>
        )}
        {base.views.length > 1 && (
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() =>
              modals.openConfirmModal({
                title: t("Delete view"),
                centered: true,
                children: <Text size="sm">{t("The entries are kept. Only this view is deleted.")}</Text>,
                labels: { confirm: t("Delete"), cancel: t("Cancel") },
                confirmProps: { color: "red" },
                onConfirm: async () => {
                  onDeleted();
                  await actions.deleteView(view.id);
                },
              })
            }
          >
            {t("Delete view")}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

const OPERATORS: { value: FilterOperator; label: string; types?: string[] }[] = [
  { value: "contains", label: "contains", types: ["text", "url", "number", "date", "multiSelect", "select"] },
  { value: "is", label: "is", types: ["text", "url", "number", "date", "select", "multiSelect"] },
  { value: "isNot", label: "is not", types: ["text", "url", "number", "date", "select", "multiSelect"] },
  { value: "isEmpty", label: "is empty" },
  { value: "isNotEmpty", label: "is not empty" },
  { value: "checked", label: "is checked", types: ["checkbox"] },
  { value: "unchecked", label: "is not checked", types: ["checkbox"] },
];

function FilterButton({ base, view, onChange }: { base: IBase; view: IBaseView; onChange: (f: IViewFilter[]) => void }) {
  const { t } = useTranslation();
  const filters = (view.config.filters ?? []).filter((f) => base.properties.some((p) => p.id === f.propertyId));
  const update = (i: number, patch: Partial<IViewFilter>) =>
    onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <Popover position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <Button size="xs" variant={filters.length ? "light" : "subtle"} color={filters.length ? "blue" : "gray"} leftSection={<IconFilter size={14} />}>
          {t("Filter")}
          {filters.length > 0 && (
            <Badge size="xs" ml={4} circle>
              {filters.length}
            </Badge>
          )}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" miw={420}>
          {filters.map((f, i) => {
            const prop = base.properties.find((p) => p.id === f.propertyId)!;
            const ops = OPERATORS.filter((o) => !o.types || o.types.includes(prop.type));
            const needsValue = ["contains", "is", "isNot"].includes(f.operator);
            const isSelect = prop.type === "select" || prop.type === "multiSelect";
            return (
              <Group key={i} gap={6} wrap="nowrap">
                <Select
                  size="xs"
                  w={130}
                  comboboxProps={{ withinPortal: false }}
                  data={base.properties.map((p) => ({ value: p.id, label: p.name }))}
                  value={f.propertyId}
                  onChange={(v) => {
                    const p = base.properties.find((x) => x.id === v);
                    if (p) update(i, { propertyId: p.id, operator: p.type === "checkbox" ? "checked" : "contains", value: undefined });
                  }}
                  allowDeselect={false}
                />
                <Select
                  size="xs"
                  w={120}
                  comboboxProps={{ withinPortal: false }}
                  data={ops.map((o) => ({ value: o.value, label: t(o.label) }))}
                  value={f.operator}
                  onChange={(v) => v && update(i, { operator: v as FilterOperator })}
                  allowDeselect={false}
                />
                {needsValue &&
                  (isSelect && f.operator !== "contains" ? (
                    <Select
                      size="xs"
                      style={{ flex: 1 }}
                      comboboxProps={{ withinPortal: false }}
                      data={optionsOf(prop).map((o) => ({ value: o.id, label: o.name }))}
                      value={f.value ?? null}
                      onChange={(v) => update(i, { value: v ?? undefined })}
                    />
                  ) : (
                    <TextInput
                      size="xs"
                      style={{ flex: 1 }}
                      value={f.value ?? ""}
                      onChange={(e) => update(i, { value: e.currentTarget.value })}
                    />
                  ))}
                <ActionIcon variant="subtle" color="gray" onClick={() => onChange(filters.filter((_, j) => j !== i))} aria-label={t("Remove")}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            );
          })}
          {!filters.length && (
            <Text size="sm" c="dimmed">
              {t("No filters in this view")}
            </Text>
          )}
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              const p = base.properties[0];
              onChange([...filters, { propertyId: p.id, operator: "contains", value: "" }]);
            }}
          >
            {t("Add filter")}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function SortButton({
  base,
  view,
  onChange,
}: {
  base: IBase;
  view: IBaseView;
  onChange: (s: IViewConfig["sorts"]) => void;
}) {
  const { t } = useTranslation();
  const sorts = (view.config.sorts ?? []).filter((s) => base.properties.some((p) => p.id === s.propertyId));
  return (
    <Popover position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <Button size="xs" variant={sorts.length ? "light" : "subtle"} color={sorts.length ? "blue" : "gray"} leftSection={<IconArrowsSort size={14} />}>
          {t("Sort")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" miw={300}>
          {sorts.map((s, i) => (
            <Group key={i} gap={6} wrap="nowrap">
              <Select
                size="xs"
                style={{ flex: 1 }}
                comboboxProps={{ withinPortal: false }}
                data={base.properties.map((p) => ({ value: p.id, label: p.name }))}
                value={s.propertyId}
                onChange={(v) => v && onChange(sorts.map((x, j) => (j === i ? { ...x, propertyId: v } : x)))}
                allowDeselect={false}
              />
              <Select
                size="xs"
                w={130}
                comboboxProps={{ withinPortal: false }}
                data={[
                  { value: "asc", label: t("Ascending") },
                  { value: "desc", label: t("Descending") },
                ]}
                value={s.direction}
                onChange={(v) => v && onChange(sorts.map((x, j) => (j === i ? { ...x, direction: v as "asc" | "desc" } : x)))}
                allowDeselect={false}
              />
              <ActionIcon variant="subtle" color="gray" onClick={() => onChange(sorts.filter((_, j) => j !== i))} aria-label={t("Remove")}>
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
          {!sorts.length && (
            <Text size="sm" c="dimmed">
              {t("Manual order")}
            </Text>
          )}
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            style={{ alignSelf: "flex-start" }}
            onClick={() => onChange([...sorts, { propertyId: base.properties[0].id, direction: "asc" }])}
          >
            {t("Add sort")}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function PropertiesButton({
  base,
  view,
  onChange,
}: {
  base: IBase;
  view: IBaseView;
  onChange: (patch: Partial<IViewConfig>) => void;
}) {
  const { t } = useTranslation();
  const hidden = new Set(view.config.hiddenPropertyIds ?? []);
  return (
    <Popover position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <Button size="xs" variant="subtle" color="gray" leftSection={<IconEye size={14} />}>
          {t("Properties")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6} miw={200}>
          {base.properties
            .filter((p) => !p.isPrimary)
            .map((p) => (
              <Checkbox
                key={p.id}
                size="xs"
                label={p.name}
                checked={!hidden.has(p.id)}
                onChange={(e) => {
                  const next = new Set(hidden);
                  if (e.currentTarget.checked) next.delete(p.id);
                  else next.add(p.id);
                  onChange({ hiddenPropertyIds: [...next] });
                }}
              />
            ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
