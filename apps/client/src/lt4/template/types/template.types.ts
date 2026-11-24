// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/** Werte nach Variablenname (Groß-/Kleinschreibung egal). */
export type TemplateVariableValues = Record<string, string>;

export interface ITemplate {
  id: string;
  title: string | null;
  description?: string | null;
  icon?: string | null;
  content?: unknown;
  spaceId?: string | null;
  workspaceId?: string;
  creatorId?: string | null;
  creator?: { id: string; name: string; avatarUrl: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
  canEdit?: boolean;
}

export interface ITemplatePermissions {
  canManageWorkspace: boolean;
  manageableSpaceIds: string[];
  membersMayCreate: boolean;
}
