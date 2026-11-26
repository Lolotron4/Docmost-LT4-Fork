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
  'ai_manage', // KI-Assistent einrichten (Anbieter, Schlüssel, Freigabe)
  'ai_use', // KI-Assistent immer nutzen dürfen, auch wenn er eingeschränkt ist
  'api', // API-Schlüssel aller Personen verwalten
  'audit', // Audit-Log lesen
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
      permissions: ALL,
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

type RoleHolder = { role?: string | null; workspaceId?: string | null };

export function isOwner(user: RoleHolder): boolean {
  return user?.role === 'owner';
}

export function permissionsOf(user: RoleHolder): Lt4Permission[] {
  if (!user?.role) return [];
  if (isOwner(user)) return ALL;
  const role = user.workspaceId ? findRole(user.workspaceId, user.role) : undefined;
  if (role) return role.permissions;
  // Fallback, falls workspaceId fehlt: eingebaute Standardwerte
  return defaultRoles().find((r) => r.key === user.role)?.permissions ?? [];
}

export function hasPermission(user: RoleHolder, permission: Lt4Permission) {
  return permissionsOf(user).includes(permission);
}

/** Steht die Rolle `key` echt unter der Rolle des Handelnden? Owner dürfen alles. */
export function isBelow(actor: RoleHolder, key: string): boolean {
  if (isOwner(actor)) return true;
  if (!actor?.workspaceId || !actor.role) return false;
  if (key === 'owner') return false;
  return rankOf(actor.workspaceId, key) > rankOf(actor.workspaceId, actor.role);
}

/** Darf der Handelnde eine Person mit der Rolle `targetRole` verwalten? */
export function canActOnRole(actor: RoleHolder, targetRole: string): boolean {
  return isBelow(actor, targetRole);
}
