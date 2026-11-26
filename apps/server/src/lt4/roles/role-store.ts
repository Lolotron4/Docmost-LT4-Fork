// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Eigene Rollen mit Rangfolge.
//
// users.role enthält weiterhin einen Rollenschlüssel:
//   - 'owner', 'admin', 'member' für die eingebauten Rollen (wie im Docmost-Kern)
//   - eine UUID für selbst angelegte Rollen
//
// Die Rollen eines Arbeitsbereichs liegen in lt4_roles. Fehlen dort die
// eingebauten Rollen (z. B. bei bestehenden Installationen), gelten die
// Standardwerte unten. Damit funktionieren alte Nutzer ohne Datenänderung.
//
// Der Cache ist modulweit, damit auch synchrone Stellen im Kern
// (CASL-Fabrik, Hilfsfunktionen) die Rechte nachschlagen können.

import { ForbiddenException } from '@nestjs/common';

export const LT4_PERMISSIONS = [
  'settings', // Allgemeine Einstellungen, Sicherheit, Integrationen, Freigabe
  'members', // Mitglieder einladen, Rollen zuweisen, deaktivieren, Beitrittslinks
  'spaces', // Bereiche anlegen und alle Bereiche verwalten
  'groups', // Gruppen verwalten
  'roles', // Rollen verwalten (nur untergeordnete)
  'announcements', // Ankündigungen (Banner) verwalten
  'templates_create', // Vorlagen erstellen und eigene Vorlagen verwalten
  'templates', // Vorlagen anderer verwalten (alle Vorlagen)
  'pages_copy', // Seiten in einen anderen Bereich kopieren, auch mit nur Leserecht
  'assignments', // Abgaben aller Personen verwalten: gesperrte Seiten freischalten, Frist verlängern
  'ai_manage', // KI-Assistent einrichten (Anbieter, Schlüssel, Freigabe)
  'ai_use', // KI-Assistent immer nutzen dürfen, auch wenn er eingeschränkt ist
  'api', // API-Schlüssel aller Personen verwalten
  'audit', // Audit-Log lesen
  'backups', // Sicherungen erstellen, herunterladen und wiederherstellen
] as const;

export type Lt4Permission = (typeof LT4_PERMISSIONS)[number];

export const SYSTEM_ROLE_KEYS = ['owner', 'admin', 'member'] as const;

export interface Lt4Role {
  key: string;
  name: string;
  description: string | null;
  position: number;
  permissions: Lt4Permission[];
  isSystem: boolean;
}

const ALL: Lt4Permission[] = [...LT4_PERMISSIONS];
/**
 * Rechte, die die eingebaute Admin-Rolle NICHT automatisch hat. Owner
 * können sie Admins (oder eigenen Rollen) bewusst geben.
 */
const OWNER_DEFAULT_ONLY: Lt4Permission[] = ['backups'];
const ADMIN_DEFAULT: Lt4Permission[] = ALL.filter((p) => !OWNER_DEFAULT_ONLY.includes(p));

export function defaultRoles(): Lt4Role[] {
  return [
    {
      key: 'owner',
      name: 'Owner',
      description: null,
      position: 0,
      permissions: ALL,
      isSystem: true,
    },
    {
      key: 'admin',
      name: 'Admin',
      description: null,
      position: 100,
      permissions: ADMIN_DEFAULT,
      isSystem: true,
    },
    {
      key: 'member',
      name: 'Member',
      description: null,
      position: 1000,
      permissions: [],
      isSystem: true,
    },
  ];
}

export function sanitizePermissions(value: unknown): Lt4Permission[] {
  if (!Array.isArray(value)) return [];
  return LT4_PERMISSIONS.filter((p) => value.includes(p));
}

const cache = new Map<string, Lt4Role[]>();

/** Ersetzt die gespeicherten Rollen eines Arbeitsbereichs im Cache. */
export function setWorkspaceRoles(workspaceId: string, stored: Lt4Role[]) {
  const byKey = new Map(stored.map((r) => [r.key, r]));
  const roles: Lt4Role[] = [];
  for (const def of defaultRoles()) {
    const s = byKey.get(def.key);
    roles.push(
      s
        ? {
            ...def,
            name: s.name || def.name,
            description: s.description ?? null,
            position: def.key === 'owner' ? 0 : s.position,
            // Owner hat immer alle Rechte
            permissions: def.key === 'owner' ? ALL : s.permissions,
          }
        : def,
    );
    byKey.delete(def.key);
  }
  for (const r of byKey.values()) roles.push({ ...r, isSystem: false });
  roles.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  // Owner bleibt immer oben
  const owner = roles.findIndex((r) => r.key === 'owner');
  if (owner > 0) roles.unshift(...roles.splice(owner, 1));
  cache.set(workspaceId, roles);
}

export function clearRoleCache() {
  cache.clear();
}

/** Alle Rollen eines Arbeitsbereichs, sortiert von oben (Owner) nach unten. */
export function getWorkspaceRoles(workspaceId: string): Lt4Role[] {
  return cache.get(workspaceId) ?? defaultRoles();
}

export function findRole(workspaceId: string, key: string): Lt4Role | undefined {
  return getWorkspaceRoles(workspaceId).find((r) => r.key === key);
}

/**
 * Rang einer Rolle: 0 = ganz oben (Owner). Unbekannte Rollen landen ganz
 * unten, damit sie niemandem Rechte über andere geben.
 */
export function rankOf(workspaceId: string, key: string): number {
  const roles = getWorkspaceRoles(workspaceId);
  const i = roles.findIndex((r) => r.key === key);
  return i < 0 ? roles.length : i;
}

type RoleHolder = {
  id?: string | null;
  role?: string | null;
  workspaceId?: string | null;
};

// ------------------------------------------------------------ Gruppen-Rollen
// Eine Gruppe kann eine Rolle haben. Mitglieder bekommen deren Rechte dazu;
// für die Rangfolge zählt die höchste ihrer Rollen (eigene oder Gruppe).

/** userId -> Rollenschlüssel aus Gruppen */
let userGroupRoles = new Map<string, string[]>();
/** groupId -> Rollenschlüssel */
let groupRoles = new Map<string, string>();
let reloadHook: (() => void) | null = null;
let reloadTimer: NodeJS.Timeout | null = null;

export function setGroupRoleData(
  byGroup: Map<string, string>,
  byUser: Map<string, string[]>,
) {
  groupRoles = byGroup;
  userGroupRoles = byUser;
}

export function setGroupRoleReloadHook(fn: () => void) {
  reloadHook = fn;
}

/**
 * Nach Änderungen an Gruppenmitgliedschaften aufrufen. Lädt kurz danach neu
 * (nach dem Commit der Transaktion des Aufrufers).
 */
export function scheduleGroupRoleReload() {
  if (!reloadHook) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    reloadHook?.();
  }, 300);
  reloadTimer.unref?.();
}

export function groupRoleOf(groupId: string): string | undefined {
  return groupRoles.get(groupId);
}

/** Eigene Rolle und Rollen aus Gruppen (ohne Owner aus Gruppen). */
export function roleKeysOf(user: RoleHolder): string[] {
  const keys = user?.role ? [user.role] : [];
  const fromGroups = user?.id ? userGroupRoles.get(user.id) ?? [] : [];
  for (const k of fromGroups) if (k !== 'owner' && !keys.includes(k)) keys.push(k);
  return keys;
}

export function groupRoleKeysOf(userId: string): string[] {
  return userGroupRoles.get(userId) ?? [];
}

/** Wirft, wenn eine der Gruppen eine Rolle hat, die nicht unter der eigenen steht. */
export function assertGroupRolesBelow(actor: RoleHolder, groupIds: string[] | null | undefined) {
  for (const id of groupIds ?? []) {
    const role = groupRoles.get(id);
    if (role && !isBelow(actor, role)) {
      throw new ForbiddenException('This group has a role above or equal to your own');
    }
  }
}

/** Höchster Rang (kleinste Zahl) über alle Rollen der Person. */
function topRankOf(user: RoleHolder): number {
  if (!user?.workspaceId) return Number.MAX_SAFE_INTEGER;
  const keys = roleKeysOf(user);
  if (!keys.length) return Number.MAX_SAFE_INTEGER;
  return Math.min(...keys.map((k) => rankOf(user.workspaceId, k)));
}

export function isOwner(user: RoleHolder): boolean {
  return user?.role === 'owner';
}

function permissionsOfKey(workspaceId: string | null | undefined, key: string) {
  const role = workspaceId ? findRole(workspaceId, key) : undefined;
  if (role) return role.permissions;
  // Fallback, falls workspaceId fehlt: eingebaute Standardwerte
  return defaultRoles().find((r) => r.key === key)?.permissions ?? [];
}

export function permissionsOf(user: RoleHolder): Lt4Permission[] {
  if (!user?.role) return [];
  if (isOwner(user)) return ALL;
  const set = new Set<Lt4Permission>();
  for (const key of roleKeysOf(user)) {
    for (const p of permissionsOfKey(user.workspaceId, key)) set.add(p);
  }
  return LT4_PERMISSIONS.filter((p) => set.has(p));
}

export function hasPermission(user: RoleHolder, permission: Lt4Permission) {
  return permissionsOf(user).includes(permission);
}

/** Steht die Rolle `key` echt unter der höchsten Rolle des Handelnden? Owner dürfen alles. */
export function isBelow(actor: RoleHolder, key: string): boolean {
  if (isOwner(actor)) return true;
  if (!actor?.workspaceId || !actor.role) return false;
  if (key === 'owner') return false;
  return rankOf(actor.workspaceId, key) > topRankOf(actor);
}

/** Darf der Handelnde eine Person mit der Rolle `targetRole` verwalten? */
export function canActOnRole(actor: RoleHolder, targetRole: string): boolean {
  return isBelow(actor, targetRole);
}

/**
 * Darf der Handelnde diese Person verwalten? Berücksichtigt auch Rollen,
 * die die Person über Gruppen hat (die höchste zählt).
 */
export function canActOnUser(actor: RoleHolder, target: RoleHolder): boolean {
  if (isOwner(actor)) return true;
  if (!target?.role) return false;
  return roleKeysOf(target).every((k) => isBelow(actor, k));
}
