// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { IRoleData } from "@/lib/types.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { userRoleData } from "@/features/workspace/types/user-role-data.ts";
import { getRoles, ILt4Role, ILt4RolesResponse } from "./roles-service";

export const ROLES_QUERY_KEY = ["lt4-roles"];

const SYSTEM_DEFAULT_NAMES: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function useRolesQuery() {
  const [currentUser] = useAtom(currentUserAtom);
  return useQuery({
    queryKey: [...ROLES_QUERY_KEY, currentUser?.user?.id],
    queryFn: getRoles,
    enabled: !!currentUser?.user?.id,
    staleTime: 30_000,
  });
}

export function useSetRolesData() {
  const queryClient = useQueryClient();
  return (data: ILt4RolesResponse) => {
    queryClient.setQueriesData({ queryKey: ROLES_QUERY_KEY }, data);
    queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
  };
}

/** Anzeigename und Beschreibung einer Rolle, eingebaute Rollen übersetzt. */
export function useRoleLabels() {
  const { t } = useTranslation();
  const { data } = useRolesQuery();

  const nameOf = (role: Pick<ILt4Role, "key" | "name" | "isSystem">) =>
    role.isSystem && role.name === SYSTEM_DEFAULT_NAMES[role.key]
      ? t(role.name)
      : role.name;

  const descriptionOf = (role: ILt4Role) => {
    if (role.description) return role.description;
    if (role.isSystem) {
      const d = userRoleData.find((r) => r.value === role.key)?.description;
      return d ? t(d) : "";
    }
    return "";
  };

  const labelOf = (key: string | null | undefined): string => {
    if (!key) return "";
    const role = data?.roles?.find((r) => r.key === key);
    if (role) return nameOf(role);
    if (SYSTEM_DEFAULT_NAMES[key]) return t(SYSTEM_DEFAULT_NAMES[key]);
    return t("Unknown role");
  };

  /** Rollen, die ich vergeben darf (für Auswahlmenüs). */
  const assignableRoles = (opts?: { withOwner?: boolean }): IRoleData[] =>
    (data?.roles ?? [])
      .filter((r) => r.assignable)
      .filter((r) => opts?.withOwner || r.key !== "owner")
      .map((r) => ({
        value: r.key,
        label: nameOf(r),
        description: descriptionOf(r),
      }));

  /** Darf ich eine Person mit dieser Rolle verwalten (Rangfolge)? */
  const canManageRole = (key: string | null | undefined) =>
    !!key && !!data?.roles?.find((r) => r.key === key)?.assignable;

  return {
    canManageRole,
    roles: data?.roles ?? [],
    data,
    nameOf,
    descriptionOf,
    labelOf,
    assignableRoles,
  };
}
