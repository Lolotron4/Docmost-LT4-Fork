// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export const LT4_PERMISSIONS = [
  "settings",
  "members",
  "spaces",
  "groups",
  "roles",
  "announcements",
  "templates",
  "ai_manage",
  "ai_use",
  "api",
  "audit",
] as const;

export type Lt4Permission = (typeof LT4_PERMISSIONS)[number];

/** Gruppen für die Anzeige im Rollen-Dialog. */
export const PERMISSION_GROUPS: { label: string; items: Lt4Permission[] }[] = [
  { label: "Workspace", items: ["settings", "announcements", "audit"] },
  { label: "People", items: ["members", "groups", "roles"] },
  { label: "Content and tools", items: ["spaces", "templates", "ai_use", "ai_manage", "api"] },
];

export const PERMISSION_LABELS: Record<
  Lt4Permission,
  { label: string; description: string }
> = {
  settings: {
    label: "Manage workspace settings",
    description: "General settings, security, sign-in, integrations and public sharing",
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
  roles: {
    label: "Manage roles",
    description: "Create, rename and edit roles below your own role",
  },
  announcements: {
    label: "Manage announcements",
    description: "Create, change and remove banners for the workspace",
  },
  templates: {
    label: "Manage templates",
    description: "Edit workspace templates and templates in every space",
  },
  ai_manage: {
    label: "Manage AI assistant",
    description: "Set up provider, keys and who may use the AI assistant",
  },
  ai_use: {
    label: "Use AI assistant",
    description: "Always allowed to use the AI assistant, even when it is limited to certain people",
  },
  api: {
    label: "Manage all API keys",
    description: "See and revoke API keys of all members",
  },
  audit: {
    label: "View audit log",
    description: "See who changed what in the workspace",
  },
};

/** Für ältere zwischengespeicherte Sitzungen ohne permissions-Feld. */
export function fallbackPermissions(role?: string | null): string[] {
  if (role === "owner" || role === "admin") return [...LT4_PERMISSIONS];
  return [];
}
