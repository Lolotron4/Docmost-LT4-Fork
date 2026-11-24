// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";

/** Aktive Sperrgründe (Seite, eingebettete Inhalte aus anderen Bereichen ...). */
const printBlockReasonsAtom = atom<string[]>([]);

/** Blendet beim Drucken den Inhalt aus, solange ein Grund gesetzt ist. */
export function useDisablePrint(reason: string | null | undefined): void {
  const setReasons = useSetAtom(printBlockReasonsAtom);
  useEffect(() => {
    if (!reason) return;
    const style = document.createElement("style");
    style.textContent = "@media print { body { display: none !important; } }";
    document.head.appendChild(style);
    setReasons((prev) => [...prev, reason]);
    return () => {
      style.remove();
      setReasons((prev) => {
        const i = prev.indexOf(reason);
        return i === -1 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)];
      });
    };
  }, [reason, setReasons]);
}

/** Erster aktiver Grund, warum Drucken gerade gesperrt ist (oder null). */
export function usePrintBlockReason(): string | null {
  return useAtomValue(printBlockReasonsAtom)[0] ?? null;
}
