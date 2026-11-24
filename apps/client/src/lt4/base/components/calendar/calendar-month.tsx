// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import dayjs from "dayjs";
import { ActionIcon, Button, Group, Select, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBase, IBaseRow, IBaseView } from "../../types/base.types";
import { BaseActions } from "../../queries/base-query";
import { dateOf, dateValueOf, timeOf, todayIso } from "../../base.utils";
import classes from "../base.module.css";

interface Props {
  base: IBase;
  view: IBaseView;
  rows: IBaseRow[];
  editable: boolean;
  actions: BaseActions;
  onOpenRow: (rowId: string) => void;
}

const MAX_PER_DAY = 4;

export function CalendarMonth({ base, view, rows, editable, actions, onOpenRow }: Props) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const dateProp = base.properties.find((p) => p.id === view.config.datePropertyId && p.type === "date");
  const dateProps = base.properties.filter((p) => p.type === "date");
  const primary = base.properties.find((p) => p.isPrimary);
  const lang = i18n.language || "en";
  const mondayFirst = lang.startsWith("de");

  if (!dateProp) {
    return (
      <Stack align="flex-start" gap="sm" py="md">
        <Text size="sm" c="dimmed">
          {t("Choose a date property for the calendar.")}
        </Text>
        {dateProps.length > 0 ? (
          <Select
            size="xs"
            data={dateProps.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => v && actions.updateView(view.id, { config: { ...view.config, datePropertyId: v } })}
            disabled={!editable}
          />
        ) : (
          editable && (
            <Button
              size="xs"
              variant="default"
              onClick={async () => {
                const prop = await actions.addProperty(t("Date"), "date");
                if (prop) actions.updateView(view.id, { config: { ...view.config, datePropertyId: prop.id } });
              }}
            >
              {t("Add a date property")}
            </Button>
          )
        )}
      </Stack>
    );
  }

  const offset = (month.day() - (mondayFirst ? 1 : 0) + 7) % 7;
  const start = month.subtract(offset, "day");
  const weeks = Math.ceil((offset + month.daysInMonth()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => start.add(i, "day"));
  const today = todayIso();

  const byDay = new Map<string, IBaseRow[]>();
  for (const row of rows) {
    const d = dateOf(row.cells[dateProp.id]);
    if (!d) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), row]);
  }
  // Ganztägige zuerst, dann nach Uhrzeit.
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const sa = dateValueOf(a.cells[dateProp.id])!.start;
      const sb = dateValueOf(b.cells[dateProp.id])!.start;
      return (sa.length - sb.length) || sa.localeCompare(sb);
    });
  }
  const timeLabel = (row: IBaseRow) => {
    const v = dateValueOf(row.cells[dateProp.id]);
    const t1 = timeOf(v?.start);
    if (!t1) return "";
    const t2 = v?.end?.slice(0, 10) === v?.start.slice(0, 10) ? timeOf(v?.end) : null;
    return t2 ? `${t1}–${t2} ` : `${t1} `;
  };
  const undated = rows.filter((r) => !dateOf(r.cells[dateProp.id])).length;

  const title = (row: IBaseRow) => (primary && String(row.cells[primary.id] ?? "")) || t("Untitled");

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap={4}>
          <Text fw={600} size="lg" miw={170}>
            {month.toDate().toLocaleDateString(lang, { month: "long", year: "numeric" })}
          </Text>
          <ActionIcon variant="subtle" color="gray" onClick={() => setMonth((m) => m.subtract(1, "month"))} aria-label={t("Previous")}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Button size="compact-sm" variant="default" onClick={() => setMonth(dayjs().startOf("month"))}>
            {t("Today")}
          </Button>
          <ActionIcon variant="subtle" color="gray" onClick={() => setMonth((m) => m.add(1, "month"))} aria-label={t("Next")}>
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
        {undated > 0 && (
          <Text size="xs" c="dimmed">
            {t("{{count}} entries without date", { count: undated })}
          </Text>
        )}
      </Group>
      <div className={classes.calGrid} data-lt4-base-drag>
        {days.slice(0, 7).map((d) => (
          <div key={`h${d.day()}`} className={classes.calHead}>
            {d.toDate().toLocaleDateString(lang, { weekday: "short" })}
          </div>
        ))}
        {days.map((d) => {
          const iso = d.format("YYYY-MM-DD");
          const items = byDay.get(iso) ?? [];
          const visible = expanded === iso ? items : items.slice(0, MAX_PER_DAY);
          return (
            <div
              key={iso}
              className={classes.calDay}
              data-outside={!d.isSame(month, "month") || undefined}
              data-drop={dropDay === iso || undefined}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (dropDay !== iso) setDropDay(iso);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId;
                setDragId(null);
                setDropDay(null);
                if (!id) return;
                // Uhrzeit und Dauer bleiben beim Verschieben auf einen anderen Tag erhalten.
                const old = dateValueOf(rows.find((r) => r.id === id)?.cells[dateProp.id]);
                const keep = (v?: string) => (v && v.length > 10 ? `${iso}${v.slice(10)}` : iso);
                const next = old?.end
                  ? old.end.slice(0, 10) === old.start.slice(0, 10)
                    ? { start: keep(old.start), end: keep(old.end) }
                    : { start: keep(old.start) }
                  : { start: keep(old?.start) };
                actions.updateCells(id, { [dateProp.id]: next });
              }}
            >
              <Group justify="flex-start">
                <Text span className={classes.calNum} data-today={iso === today || undefined}>
                  {d.date()}
                </Text>
              </Group>
              {editable && (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  className={classes.calAdd}
                  aria-label={t("New")}
                  onClick={async () => {
                    const row = await actions.addRow({ cells: { [dateProp.id]: { start: iso } } });
                    if (row) onOpenRow(row.id);
                  }}
                >
                  <IconPlus size={12} />
                </ActionIcon>
              )}
              {visible.map((row) => (
                <UnstyledButton
                  key={row.id}
                  className={classes.calEvent}
                  draggable={editable}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData("application/x-lt4-base-row", row.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(row.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropDay(null);
                  }}
                  onClick={() => onOpenRow(row.id)}
                  title={timeLabel(row) + title(row)}
                >
                  {timeLabel(row) && (
                    <Text span size="xs" fw={600} mr={4}>
                      {timeLabel(row).trim()}
                    </Text>
                  )}
                  {title(row)}
                </UnstyledButton>
              ))}
              {items.length > MAX_PER_DAY && expanded !== iso && (
                <UnstyledButton onClick={() => setExpanded(iso)}>
                  <Text size="xs" c="dimmed" px={4}>
                    {t("{{count}} more", { count: items.length - MAX_PER_DAY })}
                  </Text>
                </UnstyledButton>
              )}
            </div>
          );
        })}
      </div>
    </Stack>
  );
}
