// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getAiStatus } from "@/lt4/ai/services/ai-service";

/** True, wenn der KI-Assistent eingeschaltet ist und die angemeldete Person ihn nutzen darf. */
export function useAiAssistantAllowed() {
  const workspace = useAtomValue(workspaceAtom);
  const generative = workspace?.settings?.ai?.generative === true;
  const { data } = useQuery({
    queryKey: ["lt4-ai-status"],
    queryFn: getAiStatus,
    enabled: generative,
    staleTime: 60_000,
  });
  return generative && data?.allowed === true;
}
