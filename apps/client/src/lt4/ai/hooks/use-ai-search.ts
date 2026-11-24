// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter: Dieses Feature ist im LT4-Fork noch nicht gebaut.
export function useAiSearch() {
  return {
    data: undefined as unknown,
    isPending: false,
    mutate: (_args?: unknown) => {},
    reset: () => {},
    error: null as Error | null,
    streamingAnswer: "",
    streamingSources: [] as unknown[],
    clearStreaming: () => {},
  };
}
