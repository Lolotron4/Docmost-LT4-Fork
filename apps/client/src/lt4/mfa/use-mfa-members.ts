// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client";

export const MFA_MEMBERS_KEY = ["lt4-mfa-members"];

/** Menge der Nutzer-IDs mit aktiver 2FA (nur für Admins abrufbar). */
export function useMfaMembers(enabled: boolean) {
  const { data } = useQuery({
    queryKey: MFA_MEMBERS_KEY,
    enabled,
    queryFn: async () => {
      const req = await api.post<{ userIds: string[] }>("/mfa/members");
      return new Set(req.data.userIds);
    },
  });
  return data ?? new Set<string>();
}
