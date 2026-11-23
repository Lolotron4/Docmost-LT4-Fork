// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useAtomValue } from "jotai";
import { entitlementAtom } from "@/lt4/entitlement/entitlement-atom";

/** true, wenn der Server das Feature als im LT4-Fork verfügbar meldet. */
export function useHasFeature(feature: string): boolean {
  const entitlements = useAtomValue(entitlementAtom);
  return entitlements?.features?.includes(feature) ?? false;
}
