// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Baut die Nachrichten für Discord bzw. allgemeine Webhooks und verschickt sie.
import { createHmac } from 'node:crypto';
import { EVENT_COLORS, WebhookEvent, WebhookType } from './webhook-events';

export interface WebhookMessage {
  event: WebhookEvent | 'test';
  title: string;
  url?: string | null;
  description?: string | null;
  fields?: { name: string; value: string }[];
  actor?: { id: string; name: string } | null;
  space?: { id: string; name: string; slug: string } | null;
  page?: { id: string; title: string; url: string } | null;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface WebhookTarget {
  id: string;
  type: string;
  url: string;
  secret: string | null;
}

export interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

const DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);

/** Prüft die URL; gibt eine Fehlermeldung zurück oder null. */
export function validateWebhookUrl(type: WebhookType | string, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return 'Invalid URL';
  }
  if (url.username || url.password) return 'The URL must not contain a user name or password';
  if (type === 'discord') {
    if (url.protocol !== 'https:' || !DISCORD_HOSTS.has(url.hostname)) {
      return 'This is not a Discord webhook URL (https://discord.com/api/webhooks/...)';
    }
    if (!/^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)) {
      return 'This is not a Discord webhook URL (https://discord.com/api/webhooks/...)';
    }
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only http and https URLs are allowed';
  return null;
}

/** Zeigt die URL ohne den geheimen Teil. */
export function maskWebhookUrl(type: string, raw: string): string {
  try {
    const url = new URL(raw);
    if (type === 'discord') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[parts.indexOf('webhooks') + 1] ?? '';
      return `${url.origin}/api/webhooks/${id}/••••••`;
    }
    const path = url.pathname.length > 24 ? `${url.pathname.slice(0, 24)}…` : url.pathname;
    return `${url.origin}${path}${url.search ? '?••••' : ''}`;
  } catch {
    return '••••••';
  }
}

function cut(text: string | null | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function discordBody(msg: WebhookMessage) {
  const color = msg.event === 'test' ? 0x228be6 : EVENT_COLORS[msg.event];
  return {
    username: 'LT4-Docs',
    // Titel und Kommentare dürfen niemanden anpingen (@everyone, @Rolle)
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: cut(msg.title, 256),
        url: msg.url || undefined,
        description: cut(msg.description, 4000),
        color,
        author: msg.actor ? { name: cut(msg.actor.name, 256) } : undefined,
        fields: msg.fields?.slice(0, 10).map((f) => ({
          name: cut(f.name, 256),
          value: cut(f.value, 1024) ?? '-',
          inline: true,
        })),
        footer: msg.space ? { text: cut(msg.space.name, 2048) } : undefined,
        timestamp: msg.timestamp,
      },
    ],
  };
}

export function genericBody(msg: WebhookMessage) {
  return {
    event: msg.event,
    title: msg.title,
    text: msg.description ?? null,
    url: msg.url ?? null,
    timestamp: msg.timestamp,
    actor: msg.actor ?? null,
    space: msg.space ?? null,
    page: msg.page ?? null,
    data: msg.data ?? {},
  };
}

const TIMEOUT_MS = 10_000;

async function post(target: WebhookTarget, body: string, event: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'LT4-Docs-Webhook/1.0',
  };
  if (target.type === 'generic') {
    headers['x-lt4-event'] = event;
    headers['x-lt4-webhook-id'] = target.id;
    if (target.secret) {
      headers['x-lt4-signature'] =
        'sha256=' + createHmac('sha256', target.secret).update(body).digest('hex');
    }
  }
  return fetch(target.url, {
    method: 'POST',
    headers,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Verschickt eine Nachricht; versucht es bei Rate-Limit oder Serverfehler einmal erneut. */
export async function sendWebhook(target: WebhookTarget, msg: WebhookMessage): Promise<SendResult> {
  const body = JSON.stringify(target.type === 'discord' ? discordBody(msg) : genericBody(msg));
  let last: SendResult = { ok: false, status: null, error: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await post(target, body, msg.event);
      if (res.ok) return { ok: true, status: res.status, error: null };
      const text = (await res.text().catch(() => '')).slice(0, 300);
      last = { ok: false, status: res.status, error: text || res.statusText || `HTTP ${res.status}` };
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') ?? '2');
        await sleep(Math.min(Math.max(retry, 1), 10) * 1000);
        continue;
      }
      if (res.status >= 500) {
        await sleep(2000);
        continue;
      }
      return last;
    } catch (err: any) {
      last = { ok: false, status: null, error: String(err?.cause?.message ?? err?.message ?? err).slice(0, 300) };
      await sleep(2000);
    }
  }
  return last;
}
