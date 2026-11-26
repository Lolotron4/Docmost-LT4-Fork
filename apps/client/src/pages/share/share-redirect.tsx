import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { buildSharedPageUrl } from "@/features/page/page.utils.ts";
import { Error404 } from "@/components/ui/error-404.tsx";
import { useGetShareByIdQuery } from "@/features/share/queries/share-query.ts";
import { getShareBlock } from "@/lt4/share-guard/share-guard-service.ts";
import { ShareGate } from "@/lt4/share-guard/share-gate.tsx";

export default function ShareRedirect() {
  const { shareId } = useParams();
  const navigate = useNavigate();

  const { data: share, isLoading, isError, error } = useGetShareByIdQuery(shareId);

  useEffect(() => {
    if (share) {
      navigate(
        buildSharedPageUrl({
          shareId: share.key,
          pageSlugId: share?.sharedPage.slugId,
          pageTitle: share?.sharedPage.title,
        }),
        { replace: true },
      );
    }
  }, [isLoading, share]);

  if (isError) {
    // LT4: Gastlink mit Passwort oder abgelaufen
    const shareBlock = getShareBlock(error);
    if (shareBlock) return <ShareGate block={shareBlock} />;
    return <Error404 />;
  }

  if (isLoading) {
    return <></>;
  }

  return null;
}
