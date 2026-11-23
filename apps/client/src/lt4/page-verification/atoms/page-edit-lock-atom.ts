// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { atom, PrimitiveAtom } from "jotai";

export const unlockedVerifiedPageIdAtom = atom(
  null as string | null,
) as PrimitiveAtom<string | null>;
