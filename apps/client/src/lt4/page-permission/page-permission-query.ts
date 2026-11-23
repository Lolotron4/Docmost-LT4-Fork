// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error.ts";
import {
  addPagePermissions,
  getPagePermissionInfo,
  getPagePermissionMembers,
  removePagePermission,
  restrictPage,
  unrestrictPage,
  updatePagePermissionRole,
} from "./page-permission-service";

const infoKey = (pageId: string) => ["page-permission-info", pageId];
const membersKey = (pageId: string) => ["page-permission-members", pageId];

export function usePagePermissionInfoQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: infoKey(pageId ?? ""),
    queryFn: () => getPagePermissionInfo(pageId!),
    enabled: !!pageId,
  });
}

export function usePagePermissionMembersQuery(
  pageId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: membersKey(pageId ?? ""),
    queryFn: () => getPagePermissionMembers(pageId!),
    enabled: !!pageId && enabled,
  });
}

/**
 * Nach jeder Änderung: Rechte-Dialog, Seitendaten (Schloss-Symbol, canEdit)
 * und Seitenbaum neu laden.
 */
function usePermissionMutation<TArgs>(
  pageId: string,
  pageKeys: string[],
  fn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: infoKey(pageId) });
      queryClient.invalidateQueries({ queryKey: membersKey(pageId) });
      for (const key of pageKeys) {
        queryClient.invalidateQueries({ queryKey: ["pages", key] });
      }
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    },
    onError: (error) => {
      notifications.show({
        message: getApiErrorMessage(error, t("Something went wrong")),
        color: "red",
      });
    },
  });
}

export function usePagePermissionMutations(pageId: string, pageKeys: string[]) {
  return {
    restrict: usePermissionMutation(pageId, pageKeys, () =>
      restrictPage(pageId),
    ),
    unrestrict: usePermissionMutation(pageId, pageKeys, () =>
      unrestrictPage(pageId),
    ),
    add: usePermissionMutation(pageId, pageKeys, addPagePermissions),
    remove: usePermissionMutation(pageId, pageKeys, removePagePermission),
    updateRole: usePermissionMutation(
      pageId,
      pageKeys,
      updatePagePermissionRole,
    ),
  };
}
