// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Speichert die Audit-Ereignisse, die der Kern ohnehin meldet, in der
// Kern-Tabelle "audit" und löscht alte Einträge nach der Aufbewahrungsfrist.
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ClsService } from 'nestjs-cls';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sql } from 'kysely';
import { isIP } from 'node:net';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ActorType, AuditLogPayload } from '../../common/events/audit-events';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;

/** Wird nach jedem Audit-Ereignis ausgelöst (z. B. für Webhooks). */
export const LT4_AUDIT_EVENT = 'lt4.audit';
export interface Lt4AuditEventData {
  workspaceId: string;
  actorId: string | null;
  payload: AuditLogPayload;
}
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class Lt4AuditService implements IAuditService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Lt4Audit');
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly cls: ClsService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.cleanup(), 60_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private context(): AuditContext | undefined {
    try {
      return this.cls.isActive() ? this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY) : undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveWorkspaceId(
    ctx: Partial<AuditLogContext> | undefined,
    actorId?: string | null,
    payloads: AuditLogPayload[] = [],
  ) {
    if (ctx?.workspaceId) return ctx.workspaceId;
    // Neu angelegte Personen (Registrierung) haben noch keinen Handelnden
    const userId =
      actorId ??
      payloads.find((p) => p.resourceType === 'user' && isUuid(p.resourceId))?.resourceId;
    if (!userId) return null;
    const row = await this.db
      .selectFrom('users')
      .select('workspaceId')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row?.workspaceId ?? null;
  }

  private async write(payloads: AuditLogPayload[], ctx: Partial<AuditLogContext> & { actorType?: ActorType }) {
    if (payloads.length === 0) return;
    try {
      const actorId = ctx.actorId ?? null;
      const workspaceId = await this.resolveWorkspaceId(ctx, actorId, payloads);
      if (!workspaceId) return;
      // Für Webhooks (Discord & Co.); darf das Speichern nicht verhindern
      for (const payload of payloads) {
        try {
          this.events.emit(LT4_AUDIT_EVENT, { workspaceId, actorId, payload } as Lt4AuditEventData);
        } catch {
          /* ignorieren */
        }
      }
      const ip = ctx.ipAddress && isIP(ctx.ipAddress.replace(/^::ffff:/, '')) ? ctx.ipAddress : null;
      await this.db
        .insertInto('audit')
        .values(
          payloads.map((p) => ({
            workspaceId,
            actorId,
            actorType: ctx.actorType ?? (actorId ? 'user' : 'system'),
            event: p.event,
            resourceType: p.resourceType,
            resourceId: isUuid(p.resourceId) ? p.resourceId : null,
            spaceId: isUuid(p.spaceId) ? p.spaceId : null,
            changes: p.changes ? (p.changes as any) : null,
            metadata: p.metadata ? (p.metadata as any) : null,
            ipAddress: ip,
            userAgent: ctx.userAgent?.slice(0, 500) ?? null,
          })),
        )
        .execute();
    } catch (err) {
      // Audit darf nie eine Aktion verhindern
      this.logger.warn(`Audit-Eintrag fehlgeschlagen: ${err}`);
    }
  }

  log(payload: AuditLogPayload): void {
    const ctx = this.context();
    void this.write([payload], { ...(ctx ?? {}) } as any);
  }

  logWithContext(payload: AuditLogPayload, context: AuditLogContext): void {
    const ctx = this.context();
    void this.write([payload], {
      ipAddress: ctx?.ipAddress ?? undefined,
      userAgent: ctx?.userAgent ?? undefined,
      ...context,
    });
  }

  logBatchWithContext(payloads: AuditLogPayload[], context: AuditLogContext): void {
    const ctx = this.context();
    void this.write(payloads, {
      ipAddress: ctx?.ipAddress ?? undefined,
      userAgent: ctx?.userAgent ?? undefined,
      ...context,
    });
  }

  setActorId(actorId: string): void {
    const ctx = this.context();
    if (ctx) ctx.actorId = actorId;
  }

  setActorType(actorType: ActorType): void {
    const ctx = this.context();
    if (ctx) ctx.actorType = actorType;
  }

  async updateRetention(workspaceId: string, retentionDays: number): Promise<void> {
    await this.db
      .updateTable('workspaces')
      .set({ auditRetentionDays: retentionDays } as any)
      .where('id', '=', workspaceId)
      .execute();
  }

  async cleanup(): Promise<void> {
    try {
      const res = await sql`
        delete from audit a using workspaces w
        where a.workspace_id = w.id
          and a.created_at < now() - make_interval(days => coalesce(w.audit_retention_days, ${DEFAULT_AUDIT_RETENTION_DAYS})::int)
      `.execute(this.db);
      const n = Number(res.numAffectedRows ?? 0);
      if (n) this.logger.log(`${n} alte Audit-Einträge gelöscht`);
    } catch (err) {
      this.logger.warn(`Audit-Aufräumen fehlgeschlagen: ${err}`);
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
