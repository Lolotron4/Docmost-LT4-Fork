// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter: Dieses Feature ist im LT4-Fork noch nicht gebaut.
import { useQuery } from "@tanstack/react-query";
import { ISpace } from "@/features/space/types/space.types.ts";

export function usePersonalSpaceQuery(_enabled?: boolean) {
  return useQuery<ISpace | null>({
    queryKey: ["personal-space"],
    queryFn: async () => null,
    enabled: false,
  });
}
