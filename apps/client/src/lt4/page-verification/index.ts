// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export {
  usePageEditMode,
  usePageSyncPermission,
  usePageEditLockCheck,
} from "./hooks/use-page-edit-mode";
export {
  PageVerificationBadge,
  PageVerificationMenuItem,
} from "./components/page-verification-badge";
export { PageVerificationModal } from "./components/page-verification-modal";

/** Seiten werden im LT4-Fork nicht gesperrt; Änderungen setzen die Prüfung zurück. */
export function usePageEditLockSync(_pageId?: string): void {}
