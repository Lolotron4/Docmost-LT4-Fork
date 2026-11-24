// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { Feature } from "@/lt4/features";
import SpaceSettingSwitch from "./space-setting-switch";

export default function SpaceExportToggle({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  return (
    <SpaceSettingSwitch
      space={space}
      feature={Feature.EXPORT_CONTROLS}
      field="disableExport"
      value={space?.settings?.export?.disabled === true}
      title="Disable export"
      description="Nobody can export or print pages from this space."
      lockedReason={
        workspace?.settings?.export?.disabled === true
          ? t("Export is already disabled for the whole workspace.")
          : null
      }
    />
  );
}
