// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Hört auf Audit-Ereignisse und schickt passende Nachrichten an die Webhooks
// (Discord oder allgemein). Seiten mit eingeschränktem Zugriff werden nie gemeldet.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { LT4_AUDIT_EVENT, Lt4AuditEventData } from '../audit/lt4-audit.service';
import {
  AUDIT_TO_WEBHOOK,
  TEXTS,
  WORKSPACE_EVENTS,
  WebhookEvent,
  WebhookLanguage,
  fill,
} from './webhook-events';
import { WebhookMessage, sendWebhook } from './webhook-sender';

/** Neue Seiten werden kurz gesammelt, damit der Titel schon da ist (und Importe nicht fluten). */
const PAGE_CREATED_DELAY_MS = 60_000;
/** Nach so vielen Fehlern in Folge wird ein Webhook ausgeschaltet. */
const MAX_FAILURES = 10;

type WebhookRow = {
  id: string;
  workspaceId: string;
  type: string;
  url: string;
  secret: string | null;
  spaceIds: string[] | null;
  events: unknown;
  language: string;
  failureCount: number;
};

type PageInfo = {
  id: string;
  title: string | null;
  slugId: string;
  spaceId: string;
  isBase: boolean;
  deletedAt: Date | null;
};

type SpaceInfo = { id: string; name: string; slug: string };

/** Ein zu meldendes Ereignis; der Text wird je Sprache gebaut. */
interface PendingEvent {
  event: WebhookEvent;
  workspaceId: string;
  spaceId: string | null;
  build: (lang: WebhookLanguage) => WebhookMessage;
}

@Injectable()
export class WebhookDispatcherService implements OnModuleDestroy {
  private readonly logger = new Logger('Lt4Webhooks');
  /** workspaceId:spaceId -> gesammelte neue Seiten */
  private readonly pageBuffer = new Map<
    string,
    { workspaceId: string; spaceId: string; pages: Map<string, string | null>; timer: NodeJS.Timeout }
  >();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly env: EnvironmentService,
  ) {}

  onModuleDestroy() {
    for (const b of this.pageBuffer.values()) clearTimeout(b.timer);
    this.pageBuffer.clear();
  }

  // ------------------------------------------------------------ Eingang

  @OnEvent(LT4_AUDIT_EVENT, { async: true })
  async onAudit(data: Lt4AuditEventData) {
    try {
      const event = AUDIT_TO_WEBHOOK[data.payload?.event];
      if (!event) return;
      // Schnell prüfen, ob überhaupt jemand das Ereignis haben will
      if (!(await this.anyWebhookFor(data.workspaceId, event))) return;
      await this.handle(event, data);
    } catch (err) {
      this.logger.warn(`Webhook-Ereignis fehlgeschlagen: ${err}`);
    }
  }

  private async anyWebhookFor(workspaceId: string, event: WebhookEvent) {
    const row = await this.db
      .selectFrom('lt4Webhooks')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('enabled', '=', true)
      .where(sql<boolean>`events ? ${event}`)
      .executeTakeFirst();
    return !!row;
  }

  private async handle(event: WebhookEvent, data: Lt4AuditEventData) {
    const { payload, workspaceId, actorId } = data;
    const meta = (payload.metadata ?? {}) as Record<string, any>;

    if (event === 'member.joined') {
      const after = (payload.changes?.after ?? {}) as Record<string, any>;
      let name = after.name as string | undefined;
      if (!name && payload.resourceId) name = (await this.userName(payload.resourceId)) ?? undefined;
      const url = this.env.getAppUrl();
      return this.dispatch({
        event,
        workspaceId,
        spaceId: null,
        build: (lang) => ({
          event,
          title: TEXTS[lang].title[event],
          description: name ?? TEXTS[lang].someone,
          url,
          data: { userId: payload.resourceId ?? null, name: name ?? null },
          timestamp: new Date().toISOString(),
        }),
      });
    }

    if (event === 'page.created') {
      if (!payload.resourceId || !payload.spaceId) return;
      return this.bufferPage(workspaceId, payload.spaceId, payload.resourceId, actorId);
    }

    // Alle übrigen Ereignisse hängen an einer Seite
    const pageId =
      payload.resourceType === 'page' ? payload.resourceId : (meta.pageId as string | undefined);
    if (!pageId) return;
    const page = await this.page(pageId);
    if (!page || (page.deletedAt && event !== 'page.trashed')) return;
    if (await this.isRestricted(page.id)) return;
    const space = await this.space(page.spaceId);
    if (!space) return;
    const actor = actorId ? { id: actorId, name: (await this.userName(actorId)) ?? '' } : null;
    const pageUrl = this.pageUrl(space, page);
    const base = (lang: WebhookLanguage) => ({
      event,
      title: `${TEXTS[lang].title[event]}: ${this.title(page, lang)}`,
      url: event === 'page.trashed' ? null : pageUrl,
      actor: actor?.name ? actor : null,
      space,
      page: { id: page.id, title: this.title(page, lang), url: pageUrl },
      timestamp: new Date().toISOString(),
    });

    let description: ((lang: WebhookLanguage) => string | null) | null = null;
    let fields: ((lang: WebhookLanguage) => { name: string; value: string }[]) | null = null;
    let extra: Record<string, unknown> = {};

    if (event === 'comment.created' || event === 'comment.resolved') {
      const comment = payload.resourceId ? await this.comment(payload.resourceId) : null;
      if (!comment) return;
      const text = commentText(comment.content);
      extra = { commentId: comment.id, parentCommentId: comment.parentCommentId, text };
      if (event === 'comment.created') {
        description = (lang) =>
          (comment.parentCommentId ? `↪ ${TEXTS[lang].reply}: ` : '') + (cut(text, 600) || '…');
      } else {
        description = () => cut(text, 300) || null;
      }
    } else if (event === 'review.rejected') {
      const c = typeof meta.comment === 'string' ? meta.comment : null;
      extra = { comment: c };
      description = () => (c ? cut(c, 600) : null);
    } else if (event === 'read.requested') {
      const msg = typeof meta.message === 'string' ? meta.message : null;
      const due = typeof meta.dueAt === 'string' ? meta.dueAt : null;
      extra = { message: msg, dueAt: due, again: !!meta.again };
      description = () => (msg ? cut(msg, 600) : null);
      if (due) {
        fields = (lang) => [{ name: TEXTS[lang].due, value: formatDate(due) }];
      }
    } else if (event === 'read.completed') {
      const n = Number(meta.count ?? 0);
      extra = { count: n };
      description = (lang) => fill(TEXTS[lang].allRead, { n });
    }

    return this.dispatch({
      event,
      workspaceId,
      spaceId: page.spaceId,
      build: (lang) => ({
        ...base(lang),
        description: description ? description(lang) : null,
        fields: fields ? fields(lang) : undefined,
        data: extra,
      }),
    });
  }

  // ------------------------------------------------------------ Neue Seiten sammeln

  private bufferPage(workspaceId: string, spaceId: string, pageId: string, actorId: string | null) {
    const key = `${workspaceId}:${spaceId}`;
    let b = this.pageBuffer.get(key);
    if (!b) {
      const timer = setTimeout(() => void this.flushPages(key), PAGE_CREATED_DELAY_MS);
      timer.unref?.();
      b = { workspaceId, spaceId, pages: new Map(), timer };
      this.pageBuffer.set(key, b);
    }
    b.pages.set(pageId, actorId);
  }

  private async flushPages(key: string) {
    const b = this.pageBuffer.get(key);
    this.pageBuffer.delete(key);
    if (!b) return;
    try {
      const rows = (await this.db
        .selectFrom('pages')
        .select(['id', 'title', 'slugId', 'spaceId', 'isBase', 'deletedAt'])
        .where('id', 'in', [...b.pages.keys()])
        .where('deletedAt', 'is', null)
        .orderBy('createdAt', 'asc')
        .execute()) as PageInfo[];
      const pages: PageInfo[] = [];
      for (const p of rows) {
        if (p.spaceId !== b.spaceId) continue;
        if (await this.isRestricted(p.id)) continue;
        pages.push(p);
      }
      if (!pages.length) return;
      const space = await this.space(b.spaceId);
      if (!space) return;
      const actorIds = new Set(pages.map((p) => b.pages.get(p.id)).filter(Boolean) as string[]);
      const actorId = actorIds.size === 1 ? [...actorIds][0] : null;
      const actorName = actorId ? await this.userName(actorId) : null;
      const actor = actorId && actorName ? { id: actorId, name: actorName } : null;
      const event: WebhookEvent = 'page.created';

      await this.dispatch({
        event,
        workspaceId: b.workspaceId,
        spaceId: b.spaceId,
        build: (lang) => {
          const now = new Date().toISOString();
          if (pages.length === 1) {
            const p = pages[0];
            const url = this.pageUrl(space, p);
            return {
              event,
              title: `${TEXTS[lang].title[event]}: ${this.title(p, lang)}`,
              url,
              actor,
              space,
              page: { id: p.id, title: this.title(p, lang), url },
              data: { pages: [{ id: p.id, title: this.title(p, lang), url }] },
              timestamp: now,
            };
          }
          const list = pages.map((p) => ({
            id: p.id,
            title: this.title(p, lang),
            url: this.pageUrl(space, p),
          }));
          const shown = list.slice(0, 15).map((p) => `• [${escapeMd(p.title)}](${p.url})`);
          if (list.length > 15) shown.push(fill(TEXTS[lang].andMore, { n: list.length - 15 }));
          return {
            event,
            title: fill(TEXTS[lang].manyPages, { n: list.length }),
            url: `${this.env.getAppUrl()}/s/${space.slug}`,
            description: shown.join('\n'),
            actor,
            space,
            data: { pages: list },
            timestamp: now,
          };
        },
      });
    } catch (err) {
      this.logger.warn(`Neue Seiten melden fehlgeschlagen: ${err}`);
    }
  }

  // ------------------------------------------------------------ Versand

  private async dispatch(ev: PendingEvent) {
    const hooks = (await this.db
      .selectFrom('lt4Webhooks')
      .select(['id', 'workspaceId', 'type', 'url', 'secret', 'spaceIds', 'events', 'language', 'failureCount'])
      .where('workspaceId', '=', ev.workspaceId)
      .where('enabled', '=', true)
      .where(sql<boolean>`events ? ${ev.event}`)
      .execute()) as WebhookRow[];

    const targets = hooks.filter((h) => {
      const all = !h.spaceIds || h.spaceIds.length === 0;
      if (WORKSPACE_EVENTS.includes(ev.event) || !ev.spaceId) return all;
      return all || h.spaceIds.includes(ev.spaceId);
    });
    await Promise.all(targets.map((h) => this.deliver(h, ev.build(lang(h.language)))));
  }

  /** Verschickt und merkt sich das Ergebnis am Webhook. */
  async deliver(hook: Pick<WebhookRow, 'id' | 'type' | 'url' | 'secret'>, msg: WebhookMessage) {
    const result = await sendWebhook(hook, msg);
    try {
      if (result.ok) {
        await this.db
          .updateTable('lt4Webhooks')
          .set({ lastSentAt: new Date(), lastStatus: result.status, lastError: null, failureCount: 0 })
          .where('id', '=', hook.id)
          .execute();
      } else {
        // Discord: Webhook gelöscht/ungültig -> sofort aus
        const gone = hook.type === 'discord' && (result.status === 401 || result.status === 404);
        await this.db
          .updateTable('lt4Webhooks')
          .set({
            lastSentAt: new Date(),
            lastStatus: result.status,
            lastError: result.error,
            failureCount: sql`failure_count + 1`,
            enabled: gone
              ? false
              : sql`CASE WHEN failure_count + 1 >= ${MAX_FAILURES} THEN false ELSE enabled END`,
          } as any)
          .where('id', '=', hook.id)
          .execute();
        this.logger.warn(`Webhook ${hook.id} fehlgeschlagen: ${result.status ?? ''} ${result.error ?? ''}`);
      }
    } catch (err) {
      this.logger.warn(`Webhook-Status speichern fehlgeschlagen: ${err}`);
    }
    return result;
  }

  // ------------------------------------------------------------ Hilfen

  private title(page: Pick<PageInfo, 'title'>, lang: WebhookLanguage) {
    return page.title?.trim() || TEXTS[lang].untitled;
  }

  private pageUrl(space: SpaceInfo, page: Pick<PageInfo, 'slugId'>) {
    return `${this.env.getAppUrl()}/s/${space.slug}/p/${page.slugId}`;
  }

  private async isRestricted(pageId: string) {
    try {
      return await this.pagePermissionRepo.hasRestrictedAncestor(pageId);
    } catch {
      return true;
    }
  }

  private async page(id: string): Promise<PageInfo | undefined> {
    return (await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'slugId', 'spaceId', 'isBase', 'deletedAt'])
      .where('id', '=', id)
      .executeTakeFirst()) as PageInfo | undefined;
  }

  private async space(id: string): Promise<SpaceInfo | undefined> {
    const row = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'slug'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { id: row.id, name: row.name ?? row.slug, slug: row.slug } : undefined;
  }

  private async comment(id: string) {
    return this.db
      .selectFrom('comments')
      .select(['id', 'content', 'parentCommentId'])
      .where('id', '=', id)
      .executeTakeFirst();
  }

  private async userName(id: string) {
    const row = await this.db.selectFrom('users').select('name').where('id', '=', id).executeTakeFirst();
    return row?.name ?? null;
  }
}

function lang(value: string | null | undefined): WebhookLanguage {
  return value === 'en' ? 'en' : 'de';
}

function cut(text: string | null | undefined, max: number) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeMd(text: string) {
  return text.replace(/([\[\]\\*_`~|])/g, '\\$1');
}

/** Discord zeigt <t:...> in der Ortszeit der Lesenden an. */
function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `<t:${Math.floor(d.getTime() / 1000)}:f>`;
}

/** Reiner Text aus einem ProseMirror-Dokument (Kommentarinhalt). */
export function commentText(content: unknown): string {
  let doc: any = content;
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch {
      return doc;
    }
  }
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
    else if (node.type === 'mention') out.push(`@${node.attrs?.label ?? ''}`);
    else if (node.type === 'hardBreak') out.push('\n');
    if (Array.isArray(node.content)) {
      for (const c of node.content) walk(c);
      if (['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.type)) out.push('\n');
    }
  };
  walk(doc);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
