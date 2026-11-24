// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client";
import { ISpace } from "@/features/space/types/space.types.ts";

export const PERSONAL_SPACE_KEY = ["lt4-personal-space"];

export async function getPersonalSpace(): Promise<ISpace | null> {
  const req = await api.post<{ space: ISpace | null }>("/personal-space");
  return req.data?.space ?? null;
}

export async function createPersonalSpace(name?: string): Promise<ISpace> {
  const req = await api.post<ISpace>("/personal-space/create", { name });
  return req.data;
}

export function usePersonalSpaceQuery(enabled = true) {
  return useQuery<ISpace | null>({
    queryKey: PERSONAL_SPACE_KEY,
    queryFn: getPersonalSpace,
    enabled,
    staleTime: 5 * 60_000,
  });
}
