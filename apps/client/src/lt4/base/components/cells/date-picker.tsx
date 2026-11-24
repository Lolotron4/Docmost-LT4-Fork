// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { Button, Group, Stack, Switch, Text } from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { IDateValue } from "../../types/base.types";

const label = (iso: string, lang: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(lang, opts);

/**
 * Datumsauswahl; mit `includeTime` zusätzlich Beginn- und End-Uhrzeit
 * (das Ende liegt am selben Tag, z. B. 14:30–16:00).
 */
export function BaseDatePicker({
  value,
  includeTime,
  onChange,
}: {
  value: IDateValue | null;
  includeTime: boolean;
  /** close = Auswahl abgeschlossen, Popover darf zu */
  onChange: (value: IDateValue | null, close: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "en";
  const de = lang.startsWith("de");
  const day = value?.start.slice(0, 10) ?? null;
  const [from, setFrom] = useState(value?.start.slice(11, 16) ?? "");
  const [to, setTo] = useState(value?.end?.slice(11, 16) ?? "");
  const [withEnd, setWithEnd] = useState(!!value?.end);
  useEffect(() => {
    setFrom(value?.start.slice(11, 16) ?? "");
    setTo(value?.end?.slice(11, 16) ?? "");
  }, [value?.start, value?.end]);

  const build = (d: string | null, f: string, tt: string, end: boolean): IDateValue | null => {
    if (!d) return null;
    if (!includeTime || !f) return { start: d };
    const start = `${d}T${f}`;
    return end && tt && tt > f ? { start, end: `${d}T${tt}` } : { start };
  };

  return (
    <Stack gap={6}>
      <DatePicker
        value={day}
        defaultDate={day ?? undefined}
        onChange={(v) => {
          const d = v ? String(v).slice(0, 10) : null;
          onChange(build(d, from, to, withEnd), !includeTime);
        }}
        firstDayOfWeek={de ? 1 : 0}
        highlightToday
        monthLabelFormat={(d) => label(String(d), lang, { month: "long", year: "numeric" })}
        weekdayFormat={(d) => label(String(d), lang, { weekday: "short" }).slice(0, 2)}
        getMonthControlProps={(d) => ({ children: label(String(d), lang, { month: "short" }) })}
      />
      {includeTime && (
        <Stack gap={6}>
          <Group gap={6} wrap="nowrap" align="flex-end">
            <TimeInput
              size="xs"
              label={t("Time")}
              value={from}
              disabled={!day}
              onChange={(e) => setFrom(e.currentTarget.value)}
              onBlur={() => onChange(build(day, from, to, withEnd), false)}
              style={{ flex: 1 }}
            />
            {withEnd && (
              <>
                <Text size="sm" pb={6}>
                  –
                </Text>
                <TimeInput
                  size="xs"
                  label={t("Until")}
                  value={to}
                  disabled={!day || !from}
                  onChange={(e) => setTo(e.currentTarget.value)}
                  onBlur={() => onChange(build(day, from, to, true), false)}
                  style={{ flex: 1 }}
                />
              </>
            )}
          </Group>
          <Switch
            size="xs"
            label={t("End time")}
            checked={withEnd}
            disabled={!from}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              setWithEnd(on);
              if (!on) onChange(build(day, from, "", false), false);
            }}
          />
        </Stack>
      )}
      {day && (
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onChange(null, true)}>
          {t("Clear date")}
        </Button>
      )}
    </Stack>
  );
}
