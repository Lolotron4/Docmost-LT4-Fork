// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter: Dieses Feature ist im LT4-Fork noch nicht gebaut.
export {
  usePageEditMode,
  usePageSyncPermission,
  usePageEditLockCheck,
} from "./hooks/use-page-edit-mode";

export function usePageEditLockSync(_pageId?: string): void {}

export function PageVerificationBadge(_props: { readOnly?: boolean }) {
  return null;
}

export function PageVerificationMenuItem(_props: {
  pageId?: string;
  onClick?: () => void;
}) {
  return null;
}

export function PageVerificationModal(_props: {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}) {
  return null;
}
