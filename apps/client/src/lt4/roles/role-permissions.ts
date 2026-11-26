// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export const LT4_PERMISSIONS = [
  "settings",
  "members",
  "spaces",
  "groups",
  "api",
  "audit",
  "roles",
] as const;

export type Lt4Permission = (typeof LT4_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<
  Lt4Permission,
  { label: string; description: string }
> = {
  settings: {
    label: "Manage workspace settings",
    description:
      "General settings, security, AI assistant, announcements, integrations and workspace templates",
  },
  members: {
    label: "Manage members",
    description:
      "Invite people, create join links, assign roles, deactivate and remove members",
  },
  spaces: {
    label: "Manage spaces",
    description: "Create spaces and manage all spaces of the workspace",
  },
  groups: {
    label: "Manage groups",
    description: "Create groups and change their members",
  },
  api: {
    label: "Manage all API keys",
    description: "See and revoke API keys of all members",
  },
  audit: {
    label: "View audit log",
    description: "See who changed what in the workspace",
  },
  roles: {
    label: "Manage roles",
    description: "Create, rename and edit roles below your own role",
  },
};

/** Für ältere zwischengespeicherte Sitzungen ohne permissions-Feld. */
export function fallbackPermissions(role?: string | null): string[] {
  if (role === "owner" || role === "admin") return [...LT4_PERMISSIONS];
  return [];
}
