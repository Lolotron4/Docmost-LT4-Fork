// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export const LT4_PERMISSIONS = [
  "settings",
  "members",
  "spaces",
  "groups",
  "roles",
  "announcements",
  "templates_create",
  "templates",
  "pages_copy",
  "assignments",
  "ai_manage",
  "ai_use",
  "api",
  "audit",
  "page_stats",
  "webhooks",
] as const;

export type Lt4Permission = (typeof LT4_PERMISSIONS)[number];

/** Gruppen für die Anzeige im Rollen-Dialog. */
export const PERMISSION_GROUPS: { label: string; items: Lt4Permission[] }[] = [
  { label: "Workspace", items: ["settings", "announcements", "webhooks", "audit", "page_stats"] },
  { label: "People", items: ["members", "groups", "roles"] },
  { label: "Content and tools", items: ["spaces", "pages_copy", "assignments", "templates_create", "templates", "ai_use", "ai_manage", "api"] },
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
  templates_create: {
    label: "Create templates",
    description:
      "Create new templates and manage your own templates (where they can be used, delete)",
  },
  templates: {
    label: "Manage templates",
    description:
      "Manage templates of others: change where they can be used, edit and delete them",
  },
  pages_copy: {
    label: "Copy pages to other spaces",
    description:
      "Copy pages into a space you can edit, even from spaces where you can only read",
  },
  assignments: {
    label: "Manage all assignments",
    description:
      "Unlock locked assignment pages and extend deadlines, also for assignments of others",
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
  webhooks: {
    label: "Manage webhooks",
    description: "Set up messages to Discord or other services for new pages, comments and more",
  },
  audit: {
    label: "View audit log",
    description: "See who changed what in the workspace",
  },
  page_stats: {
    label: "View page statistics with names",
    description:
      "See for every page who opened it and when, and who has not opened it yet",
  },
};

/** Für ältere zwischengespeicherte Sitzungen ohne permissions-Feld. */
export function fallbackPermissions(role?: string | null): string[] {
  if (role === "owner" || role === "admin") return [...LT4_PERMISSIONS];
  return [];
}
