// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import type { MantineColorsTuple, MantineThemeOverride } from "@mantine/core";
import { generateColorTuple, normalizeHex } from "@/lt4/colors/color-utils";

export interface Lt4ThemePreset {
  id: string;
  /** Englischer Schlüssel für i18n. */
  label: string;
  /** Vorschaufarben: Akzent, Fläche hell, Fläche dunkel. */
  preview: { accent: string; light: string; dark: string };
  primary?: MantineColorsTuple;
  primaryShade?: { light: number; dark: number };
  gray?: MantineColorsTuple;
  dark?: MantineColorsTuple;
  white?: string;
}

const t = (c: string[]) => c as unknown as MantineColorsTuple;

export const LT4_THEMES: Lt4ThemePreset[] = [
  {
    id: "standard",
    label: "Standard",
    preview: { accent: "#1b72f2", light: "#ffffff", dark: "#242424" },
  },
  {
    id: "ocean",
    label: "Ocean",
    preview: { accent: "#0c8599", light: "#ffffff", dark: "#242424" },
    primary: generateColorTuple("#0c8599"),
  },
  {
    id: "forest",
    label: "Forest",
    preview: { accent: "#2f9e44", light: "#ffffff", dark: "#242424" },
    primary: generateColorTuple("#2f9e44"),
  },
  {
    id: "lavender",
    label: "Lavender",
    preview: { accent: "#7950f2", light: "#ffffff", dark: "#242424" },
    primary: generateColorTuple("#7950f2"),
  },
  {
    id: "sunset",
    label: "Sunset",
    preview: { accent: "#e8590c", light: "#ffffff", dark: "#242424" },
    primary: generateColorTuple("#e8590c"),
  },
  {
    id: "cherry",
    label: "Cherry blossom",
    preview: { accent: "#d6336c", light: "#ffffff", dark: "#242424" },
    primary: generateColorTuple("#d6336c"),
  },
  {
    id: "sepia",
    label: "Sepia",
    preview: { accent: "#a0662c", light: "#fbf6ec", dark: "#2b2621" },
    primary: generateColorTuple("#a0662c"),
    white: "#fbf6ec",
    gray: t([
      "#f6efe2", "#efe6d5", "#e6dbc6", "#dacdb4", "#c9b99c",
      "#ab9a7d", "#8a7a60", "#5a4d3a", "#40362a", "#2b241c",
    ]),
    dark: t([
      "#e2d8c8", "#c9bdab", "#9a8e7c", "#7a6e5e", "#51483d",
      "#453d34", "#38322b", "#2b2621", "#24201c", "#191613",
    ]),
  },
  {
    id: "nord",
    label: "Nord",
    preview: { accent: "#5e81ac", light: "#f8f9fb", dark: "#2e3440" },
    primary: generateColorTuple("#5e81ac"),
    primaryShade: { light: 6, dark: 5 },
    white: "#f8f9fb",
    gray: t([
      "#f2f4f8", "#eceff4", "#e5e9f0", "#d8dee9", "#c7cfdc",
      "#a3adbf", "#7b879c", "#4c566a", "#3b4252", "#2e3440",
    ]),
    dark: t([
      "#e5e9f0", "#c8cfdb", "#929db2", "#6f7b91", "#4c566a",
      "#434c5e", "#3b4252", "#2e3440", "#292e39", "#20242c",
    ]),
  },
  {
    id: "midnight",
    label: "Midnight",
    preview: { accent: "#5c6cf0", light: "#ffffff", dark: "#121a33" },
    primary: generateColorTuple("#5c6cf0"),
    primaryShade: { light: 6, dark: 5 },
    dark: t([
      "#d5dbee", "#b6bfdc", "#8090b5", "#5d6a94", "#36406a",
      "#2a3358", "#1c2442", "#121a33", "#0e1529", "#0a0f1f",
    ]),
  },
  {
    id: "graphite",
    label: "Graphite",
    preview: { accent: "#334155", light: "#ffffff", dark: "#1e2329" },
    primary: t([
      "#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
      "#64748b", "#475569", "#334155", "#1e293b", "#0f172a",
    ]),
    primaryShade: { light: 7, dark: 4 },
    dark: t([
      "#d3d7dc", "#b9bec5", "#868c95", "#6a7079", "#454a52",
      "#3a3f46", "#2c3137", "#1e2329", "#191d22", "#111417",
    ]),
  },
];

export const DEFAULT_LT4_THEME = "standard";

export function getLt4Preset(id: string | null | undefined): Lt4ThemePreset {
  return LT4_THEMES.find((p) => p.id === id) ?? LT4_THEMES[0];
}

/** Baut die Mantine-Überschreibungen für Theme + optionale eigene Akzentfarbe. */
export function buildLt4ThemeOverride(
  presetId: string | null | undefined,
  accent: string | null | undefined,
): MantineThemeOverride {
  const preset = getLt4Preset(presetId);
  const accentHex = normalizeHex(accent);
  const colors: Record<string, MantineColorsTuple> = {};

  // Die App nutzt "blue" als Hauptfarbe und an vielen Stellen direkt,
  // deshalb wird die Akzentfarbe auf "blue" gelegt.
  if (accentHex) colors.blue = generateColorTuple(accentHex);
  else if (preset.primary) colors.blue = preset.primary;
  if (preset.gray) colors.gray = preset.gray;
  if (preset.dark) colors.dark = preset.dark;

  const override: MantineThemeOverride = { colors };
  if (preset.white) override.white = preset.white;
  if (accentHex) {
    override.primaryShade = { light: 6, dark: 5 };
    override.autoContrast = true;
  } else if (preset.primaryShade) {
    override.primaryShade = preset.primaryShade as MantineThemeOverride["primaryShade"];
  }
  return override;
}
