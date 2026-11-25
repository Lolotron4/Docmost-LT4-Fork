// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import type { MantineColorsTuple } from "@mantine/core";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalisiert "#abc" / "abc" / "#AABBCC" zu "#aabbcc"; ungültig -> null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.trim();
  if (!v.startsWith("#")) v = `#${v}`;
  if (!HEX_RE.test(v)) return null;
  if (v.length === 4) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return v.toLowerCase();
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function mix(a: string, b: string, amount: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex([
    ca[0] + (cb[0] - ca[0]) * amount,
    ca[1] + (cb[1] - ca[1]) * amount,
    ca[2] + (cb[2] - ca[2]) * amount,
  ]);
}

/**
 * Erzeugt aus einer Grundfarbe die zehn Abstufungen, die Mantine erwartet.
 * Index 6 ist die Grundfarbe selbst (Standard-Abstufung im hellen Modus).
 */
export function generateColorTuple(base: string): MantineColorsTuple {
  const hex = normalizeHex(base) ?? "#1b72f2";
  const lighter = [0.92, 0.8, 0.62, 0.44, 0.28, 0.14].map((a) =>
    mix(hex, "#ffffff", a),
  );
  const darker = [0.12, 0.24, 0.36].map((a) => mix(hex, "#000000", a));
  return [...lighter, hex, ...darker] as unknown as MantineColorsTuple;
}

/** Relative Helligkeit (0 = schwarz, 1 = weiß), für lesbare Häkchen auf Farbfeldern. */
export function isLightColor(hex: string): boolean {
  const v = normalizeHex(hex);
  if (!v) return true;
  const [r, g, b] = toRgb(v).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}
