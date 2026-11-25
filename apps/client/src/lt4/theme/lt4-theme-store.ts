// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useSyncExternalStore } from "react";
import { normalizeHex } from "@/lt4/colors/color-utils";
import { DEFAULT_LT4_THEME, getLt4Preset } from "./lt4-themes";

export interface Lt4ThemeChoice {
  preset: string;
  /** Eigene Akzentfarbe (#rrggbb) oder "" für die Farbe des Themes. */
  accent: string;
}

const STORAGE_KEY = "lt4-theme";
const listeners = new Set<() => void>();

function read(): Lt4ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        preset: getLt4Preset(parsed?.preset).id,
        accent: normalizeHex(parsed?.accent) ?? "",
      };
    }
  } catch {
    // localStorage nicht verfügbar
  }
  return { preset: DEFAULT_LT4_THEME, accent: "" };
}

let current = read();

export function getLt4ThemeChoice(): Lt4ThemeChoice {
  return current;
}

export function setLt4ThemeChoice(next: Partial<Lt4ThemeChoice>) {
  const merged: Lt4ThemeChoice = {
    preset: getLt4Preset(next.preset ?? current.preset).id,
    accent:
      next.accent !== undefined
        ? (normalizeHex(next.accent) ?? "")
        : current.accent,
  };
  if (merged.preset === current.preset && merged.accent === current.accent) {
    return;
  }
  current = merged;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignorieren
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLt4ThemeChoice(): Lt4ThemeChoice {
  return useSyncExternalStore(subscribe, getLt4ThemeChoice);
}
