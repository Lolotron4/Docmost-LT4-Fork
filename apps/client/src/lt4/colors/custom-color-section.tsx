// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  ActionIcon,
  Box,
  ColorPicker,
  ColorSwatch,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { isLightColor, normalizeHex } from "./color-utils";

export type CustomColorKind = "text" | "highlight" | "table" | "callout";

const MAX_RECENT = 8;

function storageKey(kind: CustomColorKind) {
  return `lt4-recent-colors-${kind}`;
}

function readRecent(kind: CustomColorKind): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(kind)) ?? "[]");
    return Array.isArray(raw)
      ? raw.map((c) => normalizeHex(c)).filter(Boolean).slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(kind: CustomColorKind, color: string): string[] {
  const next = [color, ...readRecent(kind).filter((c) => c !== color)].slice(
    0,
    MAX_RECENT,
  );
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(next));
  } catch {
    // ignorieren
  }
  return next;
}

interface Props {
  kind: CustomColorKind;
  /** Aktuell gesetzte Farbe (für Häkchen und Startwert). */
  currentColor?: string | null;
  /** Farben der Standardpalette; die werden nicht als "zuletzt benutzt" gezeigt. */
  presetColors?: string[];
  onApply: (color: string) => void;
}

/**
 * "Eigene Farbe": zuletzt benutzte eigene Farben plus Farbwähler mit Hex-Eingabe.
 * Wird unter den Standardfarben im Editor (Text, Hervorhebung, Tabellenzellen) gezeigt.
 */
export function CustomColorSection({
  kind,
  currentColor,
  presetColors = [],
  onApply,
}: Props) {
  const { t } = useTranslation();
  const presets = new Set(presetColors.map((c) => normalizeHex(c)));
  const current = normalizeHex(currentColor);
  const [recent, setRecent] = useState<string[]>(() =>
    readRecent(kind).filter((c) => !presets.has(c)),
  );
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(
    current && !presets.has(current) ? current : "#3b82f6",
  );
  const [hexInput, setHexInput] = useState(value);
  const valid = normalizeHex(hexInput);

  const apply = (color: string) => {
    const hex = normalizeHex(color);
    if (!hex) return;
    setRecent(pushRecent(kind, hex).filter((c) => !presets.has(c)));
    setOpen(false);
    onApply(hex);
  };

  return (
    <Box
      data-lt4-custom-color
      // Mantine-Menüs reagieren sonst auf Tasten im Eingabefeld
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Text size="xs" fw={600} c="dimmed" mb={6}>
        {t("Custom color")}
      </Text>
      <Group gap={6} wrap="wrap">
        {recent.map((c) => (
          <Tooltip key={c} label={c} withArrow>
            <ColorSwatch
              component="button"
              type="button"
              color={c}
              size={22}
              radius="sm"
              aria-label={c}
              style={{ cursor: "pointer", border: "1px solid var(--mantine-color-default-border)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(c)}
            >
              {current === c && (
                <IconCheck size={14} color={isLightColor(c) ? "#000" : "#fff"} />
              )}
            </ColorSwatch>
          </Tooltip>
        ))}
        <Tooltip label={t("Pick a custom color")} withArrow>
          <ActionIcon
            variant={open ? "filled" : "default"}
            size={22}
            radius="sm"
            aria-label={t("Pick a custom color")}
            aria-expanded={open}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((o) => !o)}
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {open && (
        <Stack gap={8} mt={8}>
          <Box onMouseDown={(e) => e.preventDefault()}>
            <ColorPicker
              format="hex"
              size="sm"
              fullWidth
              value={value}
              onChange={(v) => {
                setValue(v);
                setHexInput(v);
              }}
            />
          </Box>
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label={t("Hex color")}
              placeholder="#3b82f6"
              value={hexInput}
              error={!valid && hexInput.length > 0}
              leftSection={<ColorSwatch color={valid ?? "transparent"} size={14} />}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setHexInput(v);
                const hex = normalizeHex(v);
                if (hex) setValue(hex);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (valid) apply(valid);
                }
              }}
              styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Tooltip label={t("Apply")} withArrow>
              <ActionIcon
                size={30}
                variant="filled"
                disabled={!valid}
                aria-label={t("Apply")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => valid && apply(valid)}
              >
                <IconCheck size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
      )}
    </Box>
  );
}
