// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";

/** Export ist gesperrt, wenn der Workspace ihn in den Einstellungen abschaltet. */
export function useExportDisabled(_spaceKey?: string): {
  exportDisabled: boolean;
  exportDisabledLabel: string | null;
} {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const exportDisabled = workspace?.settings?.export?.disabled === true;
  return {
    exportDisabled,
    exportDisabledLabel: exportDisabled
      ? t("Export has been disabled by an administrator")
      : null,
  };
}
