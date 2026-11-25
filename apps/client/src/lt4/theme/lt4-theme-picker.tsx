// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  Box,
  Button,
  ColorInput,
  Group,
  SimpleGrid,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSetAtom } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { updateUser } from "@/features/user/services/user-service";
import { normalizeHex } from "@/lt4/colors/color-utils";
import { LT4_THEMES } from "./lt4-themes";
import { setLt4ThemeChoice, useLt4ThemeChoice } from "./lt4-theme-store";
import classes from "./lt4-theme-picker.module.css";

const ACCENT_SWATCHES = [
  "#1b72f2", "#0c8599", "#2f9e44", "#7950f2", "#e8590c",
  "#d6336c", "#f08c00", "#e03131", "#1098ad", "#495057",
];

export function Lt4ThemePicker() {
  const { t } = useTranslation();
  const choice = useLt4ThemeChoice();
  const setUser = useSetAtom(userAtom);
  const [accentDraft, setAccentDraft] = useState(choice.accent);

  const save = async (next: { lt4Theme?: string; lt4Accent?: string }) => {
    setLt4ThemeChoice({
      ...(next.lt4Theme !== undefined && { preset: next.lt4Theme }),
      ...(next.lt4Accent !== undefined && { accent: next.lt4Accent }),
    });
    try {
      const updated = await updateUser(next);
      if (updated) setUser(updated);
    } catch {
      // lokal bleibt die Auswahl trotzdem aktiv
    }
  };

  const applyAccent = (value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    setAccentDraft(hex);
    if (hex === choice.accent) return;
    save({ lt4Accent: hex });
  };

  return (
    <Box mt="md">
      <Text size="md">{t("Color theme")}</Text>
      <Text size="sm" c="dimmed" mb="sm">
        {t("Works in light and dark mode. Saved to your account.")}
      </Text>

      <SimpleGrid cols={{ base: 2, xs: 3, sm: 5 }} spacing="sm">
        {LT4_THEMES.map((preset) => {
          const active = choice.preset === preset.id;
          return (
            <UnstyledButton
              key={preset.id}
              className={classes.card}
              data-active={active || undefined}
              aria-pressed={active}
              onClick={() => save({ lt4Theme: preset.id })}
            >
              <div className={classes.preview}>
                <div style={{ background: preset.preview.light }} />
                <div style={{ background: preset.preview.dark }} />
                <span
                  className={classes.accent}
                  style={{ background: preset.preview.accent }}
                >
                  {active && <IconCheck size={14} color="#fff" />}
                </span>
              </div>
              <Text size="sm" ta="center" mt={6} fw={active ? 600 : 400}>
                {t(preset.label)}
              </Text>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>

      <Group mt="md" align="flex-end" gap="sm" wrap="wrap">
        <ColorInput
          label={t("Custom accent color")}
          description={t("Overrides the accent color of the theme.")}
          placeholder={t("Theme color")}
          format="hex"
          swatches={ACCENT_SWATCHES}
          swatchesPerRow={10}
          value={accentDraft}
          onChange={setAccentDraft}
          onChangeEnd={applyAccent}
          onBlur={() => applyAccent(accentDraft)}
          w={260}
        />
        {choice.accent && (
          <Button
            variant="default"
            onClick={() => {
              setAccentDraft("");
              save({ lt4Accent: "" });
            }}
          >
            {t("Use theme color")}
          </Button>
        )}
      </Group>
    </Box>
  );
}
