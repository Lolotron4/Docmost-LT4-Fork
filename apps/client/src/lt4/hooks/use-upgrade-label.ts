// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useTranslation } from "react-i18next";

/** Tooltip-Text für Funktionen, die im LT4-Fork noch nicht gebaut sind. */
export function useUpgradeLabel(): string {
  const { t } = useTranslation();
  return t("Not available yet in this edition");
}
