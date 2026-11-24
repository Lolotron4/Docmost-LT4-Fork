// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useSpaceQuery } from "@/features/space/queries/space-query.ts";

/**
 * Export (und Drucken) ist gesperrt, wenn der Workspace ihn global abschaltet
 * oder der Bereich (per ID oder Slug) ihn in seinen Einstellungen sperrt.
 */
export function useExportDisabled(spaceKey?: string | null): {
  exportDisabled: boolean;
  exportDisabledLabel: string | null;
} {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const { data: space } = useSpaceQuery(spaceKey ?? "");
  if (workspace?.settings?.export?.disabled === true) {
    return {
      exportDisabled: true,
      exportDisabledLabel: t("Export has been disabled by an administrator"),
    };
  }
  if (spaceKey && space?.settings?.export?.disabled === true) {
    return {
      exportDisabled: true,
      exportDisabledLabel: t("Export is disabled in this space"),
    };
  }
  return { exportDisabled: false, exportDisabledLabel: null };
}
