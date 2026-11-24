// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { Feature } from "@/lt4/features";
import SpaceSettingSwitch from "./space-setting-switch";

export default function SpacePublicSharingToggle({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  return (
    <SpaceSettingSwitch
      space={space}
      feature={Feature.SHARING_CONTROLS}
      field="disablePublicSharing"
      value={space?.settings?.sharing?.disabled === true}
      title="Disable public sharing"
      description="Pages in this space cannot be shared publicly. Existing public links are removed when you turn this on."
      lockedReason={
        workspace?.settings?.sharing?.disabled === true
          ? t("Public sharing is already disabled for the whole workspace.")
          : null
      }
    />
  );
}
