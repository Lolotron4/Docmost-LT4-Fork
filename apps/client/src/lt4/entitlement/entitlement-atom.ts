// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { atom, PrimitiveAtom } from "jotai";

export interface IEntitlements {
  cloud: boolean;
  tier: string;
  features: string[];
}

export const entitlementAtom = atom(
  null as IEntitlements | null,
) as PrimitiveAtom<IEntitlements | null>;
