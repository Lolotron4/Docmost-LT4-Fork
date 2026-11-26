// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export const WEBHOOK_EVENTS = [
  "page.created",
  "page.trashed",
  "comment.created",
  "comment.resolved",
  "review.requested",
  "review.approved",
  "review.rejected",
  "read.requested",
  "read.completed",
  "member.joined",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export type WebhookType = "discord" | "generic";

export const EVENT_GROUPS: { label: string; items: WebhookEvent[] }[] = [
  { label: "Pages", items: ["page.created", "page.trashed"] },
  { label: "Comments", items: ["comment.created", "comment.resolved"] },
  { label: "Page review", items: ["review.requested", "review.approved", "review.rejected"] },
  { label: "Read confirmation", items: ["read.requested", "read.completed"] },
  { label: "Workspace", items: ["member.joined"] },
];

export const EVENT_LABELS: Record<WebhookEvent, string> = {
  "page.created": "New page",
  "page.trashed": "Page moved to trash",
  "comment.created": "New comment or reply",
  "comment.resolved": "Comment resolved",
  "review.requested": "Page submitted for review",
  "review.approved": "Page approved",
  "review.rejected": "Page returned for revision",
  "read.requested": "Read confirmation requested",
  "read.completed": "Everyone has confirmed reading",
  "member.joined": "New member joined",
};

export interface IWebhook {
  id: string;
  name: string;
  type: WebhookType;
  urlPreview: string;
  spaceIds: string[] | null;
  events: WebhookEvent[];
  language: "de" | "en";
  enabled: boolean;
  hasSecret: boolean;
  secret?: string;
  creatorName: string | null;
  lastSentAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  failureCount: number;
  createdAt: string;
}

export interface IWebhookSpace {
  id: string;
  name: string | null;
  slug: string;
}

export type WebhookInput = {
  name?: string;
  type?: WebhookType;
  url?: string;
  spaceIds?: string[] | null;
  events?: WebhookEvent[];
  language?: "de" | "en";
  enabled?: boolean;
  regenerateSecret?: boolean;
};

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const listWebhooks = () =>
  post<{ items: IWebhook[]; spaces: IWebhookSpace[] }>("/webhooks");
export const createWebhook = (data: WebhookInput & { name: string; type: WebhookType; url: string; events: WebhookEvent[] }) =>
  post<IWebhook>("/webhooks/create", data);
export const updateWebhook = (data: WebhookInput & { webhookId: string }) =>
  post<IWebhook>("/webhooks/update", data);
export const deleteWebhook = (webhookId: string) => post<void>("/webhooks/delete", { webhookId });
export const testWebhook = (webhookId: string) =>
  post<{ ok: boolean; status: number | null; error: string | null }>("/webhooks/test", { webhookId });
