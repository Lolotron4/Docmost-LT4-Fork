// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/main.tsx";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { Feature } from "@/lt4/features";
import {
  getVerificationInfo,
  IPageVerificationInfo,
  listVerifications,
  VerificationState,
} from "./services/page-verification-service";

export const VERIFICATION_INFO_KEY = "page-verification-info";
export const VERIFICATION_LIST_KEY = "verification-list";

export function usePageVerificationInfo(pageId?: string) {
  const enabled = useHasFeature(Feature.PAGE_VERIFICATION);
  return useQuery({
    queryKey: [VERIFICATION_INFO_KEY, pageId],
    queryFn: () => getVerificationInfo(pageId!),
    enabled: enabled && !!pageId,
    staleTime: 30_000,
  });
}

export function setVerificationInfo(info: IPageVerificationInfo) {
  queryClient.setQueryData([VERIFICATION_INFO_KEY, info.pageId], info);
  queryClient.invalidateQueries({ queryKey: [VERIFICATION_LIST_KEY] });
}

export function invalidateVerification(pageId: string) {
  queryClient.invalidateQueries({ queryKey: [VERIFICATION_INFO_KEY, pageId] });
  queryClient.invalidateQueries({ queryKey: [VERIFICATION_LIST_KEY] });
}

export function useVerificationList(params: {
  filter: "mine" | "all";
  state?: VerificationState;
}) {
  return useQuery({
    queryKey: [VERIFICATION_LIST_KEY, params],
    queryFn: () => listVerifications(params),
  });
}
