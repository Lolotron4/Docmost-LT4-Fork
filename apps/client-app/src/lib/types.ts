// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.

export type LockKind = "none" | "pin" | "password" | "pattern";

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
  kind: LockKind;
  failed: number;
  waitSeconds: number;
  unprotected: boolean;
}

export interface Space {
  id: string;
  name: string;
  icon?: string | null;
  createdAt: string;
}

export interface PageMeta {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Datenbank (Tabelle/Kanban/Kalender) statt Textseite. */
  isBase?: boolean;
}

export interface AttachmentMeta {
  id: string;
  pageId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ServerEntry {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
}

export interface NotebookState {
  version: 1;
  spaces: Space[];
  pages: PageMeta[];
  attachments: AttachmentMeta[];
  servers: ServerEntry[];
  settings: {
    /** Minuten bis zur automatischen Sperre, 0 = nie. */
    autoLockMinutes: number;
    /** Zeitpunkt des letzten Exports (für die Erinnerung). */
    lastExportAt?: string | null;
  };
}

export const emptyState = (): NotebookState => ({
  version: 1,
  spaces: [],
  pages: [],
  attachments: [],
  servers: [],
  settings: { autoLockMinutes: 5, lastExportAt: null },
});

export type PmDoc = { type: "doc"; content?: any[] };

export const emptyDoc = (): PmDoc => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});
