// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  IconBrandDiscord,
  IconBrandGoogle,
  IconBrandWindows,
  IconKey,
} from "@tabler/icons-react";

/** Symbol anhand von Vorlage oder Name (die Login-Seite kennt nur den Namen). */
export function ProviderIcon({ preset, name, size = 18 }: { preset?: string; name?: string; size?: number }) {
  const key = (preset || name || "").toLowerCase();
  if (key.includes("discord")) return <IconBrandDiscord size={size} />;
  if (key.includes("google")) return <IconBrandGoogle size={size} />;
  if (key.includes("microsoft") || key.includes("office") || key.includes("teams")) {
    return <IconBrandWindows size={size} />;
  }
  return <IconKey size={size} />;
}
