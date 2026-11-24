// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client";
import { IEntitlements } from "./entitlement-atom";

export async function getEntitlements(): Promise<IEntitlements> {
  const req = await api.post<IEntitlements>("/workspace/entitlements");
  return req.data;
}

export function useEntitlements() {
  return useQuery({
    queryKey: ["entitlements"],
    queryFn: getEntitlements,
    staleTime: 5 * 60 * 1000,
  });
}
