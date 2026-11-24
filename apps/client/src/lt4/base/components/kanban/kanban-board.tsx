// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Fragment, useState } from "react";
import { Badge, Button, Group, Select, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBase, IBaseProperty, IBaseRow, IBaseView, ISelectOption } from "../../types/base.types";
import { BaseActions } from "../../queries/base-query";
import { cellText, optionsOf } from "../../base.utils";
import { OptionBadge } from "../cells/option-badge";
import { PropertyIcon } from "../cells/property-icon";
import classes from "../base.module.css";

interface Props {
  base: IBase;
  view: IBaseView;
  properties: IBaseProperty[];
  rows: IBaseRow[];
  editable: boolean;
  actions: BaseActions;
  onOpenRow: (rowId: string) => void;
}

const NONE = "__none__";
const DRAG_TYPE = "application/x-lt4-base-row";

export function KanbanBoard({ base, view, properties, rows, editable, actions, onOpenRow }: Props) {
  const { t } = useTranslation();
  const groupProp = base.properties.find(
    (p) => p.id === view.config.groupByPropertyId && p.type === "select",
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ group: string; beforeId: string | null } | null>(null);

  const selectProps = base.properties.filter((p) => p.type === "select");

  if (!groupProp) {
    return (
      <Stack align="flex-start" gap="sm" py="md">
        <Text size="sm" c="dimmed">
          {t("Choose a select property to group the board by.")}
        </Text>
        {selectProps.length > 0 ? (
          <Select
            size="xs"
            placeholder={t("Group by")}
            data={selectProps.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => v && actions.updateView(view.id, { config: { ...view.config, groupByPropertyId: v } })}
            disabled={!editable}
          />
        ) : (
          editable && (
            <Button
              size="xs"
              variant="default"
              onClick={async () => {
                const prop = await actions.addProperty("Status", "select", {
                  options: [
                    { id: "o" + Math.random().toString(36).slice(2, 10), name: t("To do"), color: "gray" },
                    { id: "o" + Math.random().toString(36).slice(2, 10), name: t("In progress"), color: "blue" },
                    { id: "o" + Math.random().toString(36).slice(2, 10), name: t("Done"), color: "green" },
                  ],
                });
                if (prop) actions.updateView(view.id, { config: { ...view.config, groupByPropertyId: prop.id } });
              }}
            >
              {t("Add a status property")}
            </Button>
          )
        )}
      </Stack>
    );
  }

  const primary = base.properties.find((p) => p.isPrimary);
  const shown = properties.filter((p) => !p.isPrimary && p.id !== groupProp.id);
  const options = optionsOf(groupProp);
  const groups: { id: string; option: ISelectOption | null }[] = [
    ...options.map((o) => ({ id: o.id, option: o })),
    { id: NONE, option: null },
  ];
  const groupOf = (row: IBaseRow) => {
    const v = row.cells[groupProp.id];
    return typeof v === "string" && options.some((o) => o.id === v) ? v : NONE;
  };

  const onDrop = (group: string, beforeId: string | null) => {
    const rowId = dragId;
    setDragId(null);
    setDrop(null);
    if (!rowId || rowId === beforeId) return;
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const cells = groupOf(row) !== group ? { [groupProp.id]: group === NONE ? null : group } : undefined;
    // Reihenfolge in der Spalte: vor die Zielkarte, sonst hinter die letzte Karte der Spalte.
    const inGroup = rows.filter((r) => groupOf(r) === group && r.id !== rowId);
    const opts = beforeId
      ? { beforeRowId: beforeId }
      : inGroup.length
        ? { afterRowId: inGroup[inGroup.length - 1].id }
        : {};
    actions.moveRow(rowId, opts, cells);
  };

  return (
    <div className={classes.board} data-lt4-base-drag>
      {groups.map(({ id, option }) => {
        const items = rows.filter((r) => groupOf(r) === id);
        if (id === NONE && !items.length && !dragId) return null;
        return (
          <div
            key={id}
            className={classes.column}
            data-drop={drop?.group === id || undefined}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (drop?.group !== id || drop.beforeId !== null) {
                if (e.target === e.currentTarget) setDrop({ group: id, beforeId: null });
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDrop((d) => (d?.group === id ? null : d));
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(id, drop?.group === id ? drop.beforeId : null);
            }}
          >
            <Group justify="space-between" px={4} py={2} wrap="nowrap">
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                {option ? (
                  <OptionBadge option={option} />
                ) : (
                  <Text size="sm" c="dimmed">
                    {t("No {{name}}", { name: groupProp.name })}
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  {items.length}
                </Text>
              </Group>
            </Group>
            {items.map((row) => (
              <Fragment key={row.id}>
                {drop?.group === id && drop.beforeId === row.id && <div className={classes.dropLine} />}
                <UnstyledButton
                  className={classes.card}
                  draggable={editable}
                  data-dragging={dragId === row.id || undefined}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData(DRAG_TYPE, row.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(row.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDrop(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const before = e.clientY < rect.top + rect.height / 2;
                    const idx = items.findIndex((r) => r.id === row.id);
                    const beforeId = before ? row.id : items[idx + 1]?.id ?? null;
                    if (drop?.group !== id || drop.beforeId !== beforeId) setDrop({ group: id, beforeId });
                  }}
                  onClick={() => onOpenRow(row.id)}
                >
                  <Text size="sm" fw={500} lineClamp={3}>
                    {(primary && String(row.cells[primary.id] ?? "")) || (
                      <Text span c="dimmed" size="sm">
                        {t("Untitled")}
                      </Text>
                    )}
                  </Text>
                  {shown.length > 0 && (
                    <Stack gap={4} mt={6}>
                      {shown.map((p) => (
                        <CardValue key={p.id} prop={p} row={row} />
                      ))}
                    </Stack>
                  )}
                </UnstyledButton>
              </Fragment>
            ))}
            {drop?.group === id && drop.beforeId === null && items.length > 0 && <div className={classes.dropLine} />}
            {editable && (
              <UnstyledButton
                className={classes.addRow}
                style={{ height: 30, borderRadius: 6 }}
                onClick={async () => {
                  const row = await actions.addRow({
                    cells: id === NONE ? {} : { [groupProp.id]: id },
                  });
                  if (row) onOpenRow(row.id);
                }}
              >
                <IconPlus size={14} />
                {t("New")}
              </UnstyledButton>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardValue({ prop, row }: { prop: IBaseProperty; row: IBaseRow }) {
  const value = row.cells[prop.id];
  if (value === undefined || value === null || value === "") return null;
  if (prop.type === "select" || prop.type === "multiSelect") {
    const ids = Array.isArray(value) ? value : [value as string];
    const opts = optionsOf(prop);
    return (
      <Group gap={4}>
        {ids.map((id) => {
          const o = opts.find((x) => x.id === id);
          return o ? <OptionBadge key={id} option={o} size="xs" /> : null;
        })}
      </Group>
    );
  }
  if (prop.type === "checkbox") {
    return value === true ? (
      <Badge size="xs" variant="light" color="green" leftSection={<PropertyIcon type="checkbox" size={10} />} tt="none">
        {prop.name}
      </Badge>
    ) : null;
  }
  return (
    <Group gap={4} wrap="nowrap" c="dimmed">
      <PropertyIcon type={prop.type} size={12} />
      <Text size="xs" truncate>
        {prop.type === "date" ? new Date(`${cellText(prop, value)}T00:00:00`).toLocaleDateString() : cellText(prop, value)}
      </Text>
    </Group>
  );
}
