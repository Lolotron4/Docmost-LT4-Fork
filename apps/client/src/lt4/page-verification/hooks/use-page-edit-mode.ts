// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useAtom } from "jotai";
import { useCallback } from "react";
import { currentPageEditModeAtom } from "@/features/editor/atoms/editor-atoms";
import { PageEditMode } from "@/features/user/types/user.types.ts";

/**
 * Lese-/Bearbeitungsmodus der aktuellen Seite. Ohne Seitenprüfung gibt es
 * keine Sperre, daher sind alle Lock-Felder fest auf "nicht gesperrt".
 */
export function usePageEditMode(_pageId?: string) {
  const [editMode, setEditMode] = useAtom(currentPageEditModeAtom);
  const changeEditMode = useCallback(
    (mode: PageEditMode) => setEditMode(mode),
    [setEditMode],
  );
  return {
    editMode: editMode as PageEditMode,
    changeEditMode,
    isCheckingLock: false,
    isLocked: false,
    retryingVerification: false,
    verificationUnavailable: false,
    retryVerification: () => {},
  };
}

/** Ohne Seitenprüfung darf der Client Änderungen immer synchronisieren. */
export function usePageSyncPermission(_pageId?: string): () => boolean {
  return allowSync;
}

const allowSync = () => true;

export function usePageEditLockCheck(_pageId?: string): void {}
