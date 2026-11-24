// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { ISpace } from "@/features/space/types/space.types.ts";
import { Feature } from "@/lt4/features";
import SpaceSettingSwitch from "./space-setting-switch";

export default function SpaceViewerCommentsToggle({ space }: { space: ISpace }) {
  return (
    <SpaceSettingSwitch
      space={space}
      feature={Feature.VIEWER_COMMENTS}
      field="allowViewerComments"
      value={space?.settings?.comments?.allowViewerComments === true}
      title="Allow viewers to comment"
      description="Members who can only read pages in this space may still write comments."
    />
  );
}
