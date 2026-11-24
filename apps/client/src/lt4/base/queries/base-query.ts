// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter: Dieses Feature ist im LT4-Fork noch nicht gebaut.
import { useMutation, useQuery } from "@tanstack/react-query";

export function useBaseQuery(_pageId: string) {
  return useQuery<{ permissions?: { canEdit?: boolean } } | null>({
    queryKey: ["base", _pageId],
    queryFn: async () => null,
    enabled: false,
  });
}

export function useConvertPageToBaseMutation() {
  return useMutation({
    mutationFn: async (_args: unknown) => {
      throw new Error("Databases are not available yet");
    },
  });
}
