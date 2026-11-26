import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../common/helpers/types/permission';
import {
  SUPPORTED_LOCALES,
  WorkspaceUserListStatus,
} from './workspace.constants';
import { collapseBlankLines, stripLinks } from '../../common/helpers';
import { canActOnRole, findRole } from '../../lt4/roles/role-store';

export function isAdminActingOnOwner(
  authUserRole: string,
  targetRole: string,
): boolean {
  return authUserRole === UserRole.ADMIN && targetRole === UserRole.OWNER;
}

/**
 * LT4-Fork: Rangfolge der Rollen. Wer nicht Owner ist, darf nur Personen
 * und Rollen verwalten, die unter der eigenen Rolle stehen.
 */
export function cannotActOnRole(
  authUser: { role?: string | null; workspaceId?: string | null },
  targetRole: string,
): boolean {
  return !canActOnRole(authUser, targetRole);
}

/** LT4-Fork: Gibt es die Rolle in diesem Arbeitsbereich? */
export function isKnownRole(workspaceId: string, role: string): boolean {
  return !!findRole(workspaceId, role);
}

// without manage rights only active users are listed
export function resolveWorkspaceUserListStatus(
  status: WorkspaceUserListStatus | undefined,
  canManageMembers: boolean,
): WorkspaceUserListStatus {
  if (canManageMembers) {
    return status ?? 'active';
  }
  if (status === 'deactivated' || status === 'deleted') {
    throw new ForbiddenException();
  }
  return 'active';
}

export type PageEditMode = 'read' | 'edit';

export function getWorkspaceDefaultPageEditMode(
  workspace: { settings?: unknown } | null | undefined,
): PageEditMode | undefined {
  const settings = (workspace?.settings ?? {}) as {
    defaultPageEditMode?: unknown;
  };
  const mode = settings.defaultPageEditMode;
  if (mode === 'read' || mode === 'edit') {
    return mode;
  }
  return undefined;
}

export function getWorkspaceDefaultLocale(
  workspace: { settings?: unknown } | null | undefined,
): string | undefined {
  const settings = (workspace?.settings ?? {}) as {
    defaultLocale?: unknown;
  };
  const locale = settings.defaultLocale;
  if (typeof locale === 'string' && SUPPORTED_LOCALES.includes(locale)) {
    return locale;
  }
  return undefined;
}

export function normalizeInvitationMessage(
  message?: string | null,
): string | null {
  if (!message) return null;
  const normalized = collapseBlankLines(
    stripLinks(message.replace(/\r\n?/g, '\n'))
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n'),
  ).trim();
  return normalized || null;
}
