// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect } from "react";
import { useExportDisabled } from "./use-export-disabled";

const STYLE_ID = "lt4-disable-print";

/** Blendet beim Drucken den Inhalt aus, solange ein Grund gesetzt ist. */
export function useDisablePrint(reason: string | null | undefined): void {
  useEffect(() => {
    if (!reason) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "@media print { body { display: none !important; } }";
    document.head.appendChild(style);
    return () => style.remove();
  }, [reason]);
}

export function usePrintBlockReason(): string | null {
  return useExportDisabled().exportDisabledLabel;
}
