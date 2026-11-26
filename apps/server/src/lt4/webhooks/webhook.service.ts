// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Webhooks verwalten (Recht "webhooks"). Die URL ist geheim (wer sie kennt, kann
// in den Discord-Kanal schreiben) und wird nach dem Speichern nur maskiert gezeigt.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { hasPermission } from '../roles/role-store';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto';
import { TEXTS, WEBHOOK_EVENTS, fill } from './webhook-events';
import { maskWebhookUrl, validateWebhookUrl } from './webhook-sender';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';

const MAX_WEBHOOKS = 50;

@Injectable()
export class WebhookService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly dispatcher: WebhookDispatcherService,
    private readonly env: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private assertAllowed(user: User) {
    if (!hasPermission(user, 'webhooks')) throw new ForbiddenException();
  }

  private toClient(row: any, revealSecret = false) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      urlPreview: maskWebhookUrl(row.type, row.url),
      spaceIds: row.spaceIds ?? null,
      events: Array.isArray(row.events) ? row.events : [],
      language: row.language,
      enabled: row.enabled,
      hasSecret: !!row.secret,
      // Nur direkt nach dem Erstellen bzw. Neuerzeugen
      secret: revealSecret ? row.secret : undefined,
      creatorName: row.creatorName ?? null,
      lastSentAt: row.lastSentAt,
      lastStatus: row.lastStatus,
      lastError: row.lastError,
      failureCount: row.failureCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async find(workspaceId: string, id: string) {
    const row = await this.db
      .selectFrom('lt4Webhooks')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Webhook not found');
    return row;
  }

  private async checkSpaces(workspaceId: string, spaceIds?: string[] | null) {
    if (!spaceIds?.length) return null;
    const unique = [...new Set(spaceIds)];
    const rows = await this.db
      .selectFrom('spaces')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('id', 'in', unique)
      .execute();
    if (rows.length !== unique.length) throw new BadRequestException('Unknown space');
    return unique;
  }

  private cleanEvents(events: string[]) {
    return WEBHOOK_EVENTS.filter((e) => events.includes(e));
  }

  private audit(event: string, row: { id: string; name: string }, changes?: Record<string, unknown>) {
    try {
      this.auditService.log({
        event: event as any,
        resourceType: AuditResource.WEBHOOK as any,
        resourceId: row.id,
        metadata: { name: row.name, ...(changes ?? {}) },
      });
    } catch {
      /* egal */
    }
  }

  async list(user: User, workspace: Workspace) {
    this.assertAllowed(user);
    const rows = await this.db
      .selectFrom('lt4Webhooks')
      .selectAll()
      .select(sql<string>`(select name from users where users.id = lt4_webhooks.creator_id)`.as('creatorName'))
      .where('workspaceId', '=', workspace.id)
      .orderBy('createdAt', 'asc')
      .execute();
    const spaces = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'slug'])
      .where('workspaceId', '=', workspace.id)
      .orderBy('name', 'asc')
      .execute();
    return { items: rows.map((r) => this.toClient(r)), spaces };
  }

  async create(user: User, workspace: Workspace, dto: CreateWebhookDto) {
    this.assertAllowed(user);
    const err = validateWebhookUrl(dto.type, dto.url);
    if (err) throw new BadRequestException(err);
    const count = await this.db
      .selectFrom('lt4Webhooks')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();
    if (Number(count?.n ?? 0) >= MAX_WEBHOOKS) throw new BadRequestException('Too many webhooks');
    const spaceIds = await this.checkSpaces(workspace.id, dto.spaceIds);
    const row = await this.db
      .insertInto('lt4Webhooks')
      .values({
        workspaceId: workspace.id,
        name: dto.name.trim(),
        type: dto.type,
        url: dto.url.trim(),
        secret: dto.type === 'generic' ? randomBytes(24).toString('hex') : null,
        spaceIds,
        events: sql`${JSON.stringify(this.cleanEvents(dto.events))}::text::jsonb`,
        language: dto.language ?? 'de',
        enabled: dto.enabled ?? true,
        creatorId: user.id,
      })
      .returningAll()
      .executeTakeFirst();
    this.audit(AuditEvent.WEBHOOK_CREATED, row, { type: row.type });
    return this.toClient(row, true);
  }

  async update(user: User, workspace: Workspace, dto: UpdateWebhookDto) {
    this.assertAllowed(user);
    const existing = await this.find(workspace.id, dto.webhookId);
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) values.name = dto.name.trim();
    if (dto.url !== undefined && dto.url.trim()) {
      const err = validateWebhookUrl(existing.type, dto.url);
      if (err) throw new BadRequestException(err);
      values.url = dto.url.trim();
      values.failureCount = 0;
      values.lastError = null;
    }
    if (dto.spaceIds !== undefined) values.spaceIds = await this.checkSpaces(workspace.id, dto.spaceIds);
    if (dto.events !== undefined) {
      values.events = sql`${JSON.stringify(this.cleanEvents(dto.events))}::text::jsonb`;
    }
    if (dto.language !== undefined) values.language = dto.language;
    if (dto.enabled !== undefined) {
      values.enabled = dto.enabled;
      if (dto.enabled) values.failureCount = 0;
    }
    let reveal = false;
    if (dto.regenerateSecret && existing.type === 'generic') {
      values.secret = randomBytes(24).toString('hex');
      reveal = true;
    }
    const row = await this.db
      .updateTable('lt4Webhooks')
      .set(values as any)
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirst();
    this.audit(AuditEvent.WEBHOOK_UPDATED, row, {
      fields: Object.keys(values).filter((k) => !['updatedAt', 'secret', 'url'].includes(k)),
      urlChanged: values.url !== undefined,
    });
    return this.toClient(row, reveal);
  }

  async remove(user: User, workspace: Workspace, id: string) {
    this.assertAllowed(user);
    const existing = await this.find(workspace.id, id);
    await this.db.deleteFrom('lt4Webhooks').where('id', '=', existing.id).execute();
    this.audit(AuditEvent.WEBHOOK_DELETED, existing);
    return { success: true };
  }

  /** Testnachricht an den Webhook; liefert das Ergebnis direkt zurück. */
  async test(user: User, workspace: Workspace, id: string) {
    this.assertAllowed(user);
    const hook = await this.find(workspace.id, id);
    const t = TEXTS[hook.language === 'en' ? 'en' : 'de'];
    const result = await this.dispatcher.deliver(hook, {
      event: 'test',
      title: t.test,
      description: fill(t.testText, { name: hook.name }),
      url: this.env.getAppUrl(),
      actor: user.name ? { id: user.id, name: user.name } : null,
      data: { webhookId: hook.id },
      timestamp: new Date().toISOString(),
    });
    return result;
  }
}
