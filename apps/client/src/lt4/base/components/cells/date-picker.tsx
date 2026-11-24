// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Button, Stack } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useTranslation } from "react-i18next";

const label = (iso: string, lang: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(lang, opts);

export function BaseDatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "en";
  const de = lang.startsWith("de");
  return (
    <Stack gap={6}>
      <DatePicker
        value={value}
        defaultDate={value ?? undefined}
        onChange={(v) => onChange(v ? String(v).slice(0, 10) : null)}
        firstDayOfWeek={de ? 1 : 0}
        highlightToday
        monthLabelFormat={(d) => label(String(d), lang, { month: "long", year: "numeric" })}
        weekdayFormat={(d) => label(String(d), lang, { weekday: "short" }).slice(0, 2)}
        getMonthControlProps={(d) => ({ children: label(String(d), lang, { month: "short" }) })}
      />
      {value && (
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onChange(null)}>
          {t("Clear date")}
        </Button>
      )}
    </Stack>
  );
}
