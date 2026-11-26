// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Lesebestätigung: Wer eine Seite bearbeiten darf, kann alle mit Zugriff bitten,
// das Lesen zu bestätigen (z. B. Regeln, Infos, Hausaufgaben). "Erneut
// anfordern" startet eine neue Runde; ältere Bestätigungen zählen dann nicht mehr.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { NotificationService } from '../../core/notification/notification.service';
import { WsService } from '../../ws/ws.service';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

export const READ_REQUESTED_NOTIFICATION = 'lt4.read_requested';

type UserRef = { id: string; name: string | null; avatarUrl: string | null };

@Injectable()
export class ReadConfirmationService {
  private readonly logger = new Logger(ReadConfirmationService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly notificationService: NotificationService,
    private readonly wsService: WsService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /** Audit-Eintrag (und damit auch Webhooks wie Discord). */
  private audit(event: string, page: Page, metadata?: Record<string, any>) {
    try {
      this.auditService.log({
        event: event as any,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        metadata: { pageTitle: page.title, ...metadata },
      });
    } catch {
      /* Audit darf nie die eigentliche Aktion verhindern */
    }
  }

  private async loadPage(pageId: string, user: User): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== user.workspaceId) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  private async canManage(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user);
      return true;
    } catch {
      return false;
    }
  }

  private findRequest(pageId: string) {
    return this.db
      .selectFrom('lt4ReadRequests')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  /** Alle aktiven Nutzer mit Zugriff auf die Seite (ohne den Anfragenden). */
  private async audience(page: Page, excludeId?: string | null): Promise<UserRef[]> {
    const rows = await this.db
      .selectFrom('users')
      .select(['users.id', 'users.name', 'users.avatarUrl'])
      .where('users.workspaceId', '=', page.workspaceId)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb(
            'users.id',
            'in',
            eb
              .selectFrom('spaceMembers')
              .select('spaceMembers.userId')
              .where('spaceMembers.spaceId', '=', page.spaceId)
              .where('spaceMembers.userId', 'is not', null),
          ),
          eb(
            'users.id',
            'in',
            eb
              .selectFrom('spaceMembers')
              .innerJoin('groupUsers', 'groupUsers.groupId', 'spaceMembers.groupId')
              .select('groupUsers.userId')
              .where('spaceMembers.spaceId', '=', page.spaceId),
          ),
        ]),
      )
      .orderBy('users.name')
      .limit(2000)
      .execute();
    const allowed = new Set(
      await this.pagePermissionRepo.getUserIdsWithPageAccess(
        page.id,
        rows.map((r) => r.id),
      ),
    );
    return rows.filter((r) => allowed.has(r.id) && r.id !== excludeId);
  }

  private async confirmations(requestId: string, since: Date | string) {
    const rows = await this.db
      .selectFrom('lt4ReadConfirmations')
      .select(['userId', 'confirmedAt'])
      .where('requestId', '=', requestId)
      .where('confirmedAt', '>=', new Date(since))
      .execute();
    return new Map(rows.map((r) => [r.userId, r.confirmedAt]));
  }

  private async emit(page: Page) {
    try {
      await this.wsService.emitCommentEvent(page.spaceId, page.id, {
        operation: 'lt4ReadConfirmationUpdated',
        pageId: page.id,
      });
    } catch {
      /* nur Komfort */
    }
  }

  private async notify(page: Page, actor: User, recipients: UserRef[], message?: string | null) {
    for (const r of recipients) {
      try {
        await this.notificationService.create({
          userId: r.id,
          workspaceId: page.workspaceId,
          type: READ_REQUESTED_NOTIFICATION,
          actorId: actor.id,
          pageId: page.id,
          spaceId: page.spaceId,
          data: message ? { message: message.slice(0, 200) } : null,
        });
      } catch (err) {
        this.logger.warn(`Benachrichtigung fehlgeschlagen: ${err}`);
      }
    }
  }

  // ---------- API ----------

  async info(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    const request = await this.findRequest(page.id);
    const canManage = await this.canManage(page, user);
    if (!request) return { pageId: page.id, request: null, canManage };

    const mine = await this.db
      .selectFrom('lt4ReadConfirmations')
      .select('confirmedAt')
      .where('requestId', '=', request.id)
      .where('userId', '=', user.id)
      .where('confirmedAt', '>=', new Date(request.roundStartedAt))
      .executeTakeFirst();

    const requester = request.requestedById
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name', 'avatarUrl'])
          .where('id', '=', request.requestedById)
          .executeTakeFirst()
      : null;

    let stats: { confirmed: number; total: number } | null = null;
    if (canManage) {
      const audience = await this.audience(page, request.requestedById);
      const confirmed = await this.confirmations(request.id, request.roundStartedAt);
      stats = {
        total: audience.length,
        confirmed: audience.filter((u) => confirmed.has(u.id)).length,
      };
    }

    return {
      pageId: page.id,
      canManage,
      request: {
        id: request.id,
        message: request.message,
        dueAt: request.dueAt,
        roundStartedAt: request.roundStartedAt,
        createdAt: request.createdAt,
        requestedBy: requester ?? null,
      },
      // Der Anfragende muss nicht selbst bestätigen
      mustConfirm: user.id !== request.requestedById,
      myConfirmedAt: mine?.confirmedAt ?? null,
      stats,
    };
  }

  async request(
    dto: { pageId: string; message?: string | null; dueAt?: string | null; notify?: boolean },
    user: User,
  ) {
    const page = await this.loadPage(dto.pageId, user);
    if (!(await this.canManage(page, user))) throw new ForbiddenException();
    const existing = await this.findRequest(page.id);
    const message = dto.message?.trim().slice(0, 1000) || null;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && isNaN(dueAt.getTime())) throw new BadRequestException('Invalid due date');
    const now = new Date();

    if (existing) {
      await this.db
        .updateTable('lt4ReadRequests')
        .set({ message, dueAt, updatedAt: now })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await this.db
        .insertInto('lt4ReadRequests')
        .values({
          pageId: page.id,
          spaceId: page.spaceId,
          workspaceId: page.workspaceId,
          requestedById: user.id,
          message,
          dueAt,
          roundStartedAt: now,
        })
        .execute();
    }
    if (!existing || dto.notify) {
      const audience = await this.audience(page, existing?.requestedById ?? user.id);
      await this.notify(page, user, audience.filter((u) => u.id !== user.id), message);
    }
    if (!existing) {
      this.audit(AuditEvent.READ_CONFIRMATION_REQUESTED, page, {
        message,
        dueAt: dueAt?.toISOString() ?? null,
      });
    }
    await this.emit(page);
    return this.info(page.id, user);
  }

  /** Neue Runde: alle müssen erneut bestätigen (z. B. nach Änderungen). */
  async askAgain(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    if (!(await this.canManage(page, user))) throw new ForbiddenException();
    const existing = await this.findRequest(page.id);
    if (!existing) throw new BadRequestException('No read confirmation requested for this page');
    const now = new Date();
    await this.db
      .updateTable('lt4ReadRequests')
      .set({ roundStartedAt: now, updatedAt: now })
      .where('id', '=', existing.id)
      .execute();
    const audience = await this.audience(page, existing.requestedById);
    await this.notify(page, user, audience.filter((u) => u.id !== user.id), existing.message);
    this.audit(AuditEvent.READ_CONFIRMATION_REQUESTED, page, {
      message: existing.message,
      dueAt: existing.dueAt ? new Date(existing.dueAt).toISOString() : null,
      again: true,
    });
    await this.emit(page);
    return this.info(page.id, user);
  }

  /** Nur noch nicht Bestätigte erinnern. */
  async remind(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    if (!(await this.canManage(page, user))) throw new ForbiddenException();
    const existing = await this.findRequest(page.id);
    if (!existing) throw new BadRequestException('No read confirmation requested for this page');
    const audience = await this.audience(page, existing.requestedById);
    const confirmed = await this.confirmations(existing.id, existing.roundStartedAt);
    const open = audience.filter((u) => !confirmed.has(u.id) && u.id !== user.id);
    await this.notify(page, user, open, existing.message);
    return { reminded: open.length };
  }

  async remove(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    if (!(await this.canManage(page, user))) throw new ForbiddenException();
    await this.db.deleteFrom('lt4ReadRequests').where('pageId', '=', page.id).execute();
    await this.emit(page);
    return { success: true };
  }

  async confirm(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    const existing = await this.findRequest(page.id);
    if (!existing) throw new BadRequestException('No read confirmation requested for this page');
    const before = await this.confirmations(existing.id, existing.roundStartedAt);
    await this.db
      .insertInto('lt4ReadConfirmations')
      .values({ requestId: existing.id, userId: user.id, confirmedAt: new Date() })
      .onConflict((oc) =>
        oc.columns(['requestId', 'userId']).doUpdateSet({ confirmedAt: new Date() }),
      )
      .execute();
    if (!before.has(user.id)) await this.checkCompleted(page, existing, user.id);
    await this.emit(page);
    return this.info(page.id, user);
  }

  /** Meldet einmalig, wenn mit dieser Bestätigung alle gelesen haben. */
  private async checkCompleted(
    page: Page,
    request: { id: string; requestedById: string | null; roundStartedAt: any },
    userId: string,
  ) {
    try {
      const audience = await this.audience(page, request.requestedById);
      if (!audience.some((u) => u.id === userId)) return;
      const confirmed = await this.confirmations(request.id, request.roundStartedAt);
      if (audience.every((u) => confirmed.has(u.id))) {
        this.audit(AuditEvent.READ_CONFIRMATION_COMPLETED, page, { count: audience.length });
      }
    } catch (err) {
      this.logger.warn(`Lesebestätigung prüfen fehlgeschlagen: ${err}`);
    }
  }

  async status(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    if (!(await this.canManage(page, user))) throw new ForbiddenException();
    const existing = await this.findRequest(page.id);
    if (!existing) return { items: [] };
    const audience = await this.audience(page, existing.requestedById);
    const confirmed = await this.confirmations(existing.id, existing.roundStartedAt);
    const items = audience
      .map((u) => ({ user: u, confirmedAt: confirmed.get(u.id) ?? null }))
      .sort((a, b) => Number(!!a.confirmedAt) - Number(!!b.confirmedAt));
    return { items };
  }

  /** Seiten, die ich noch bestätigen muss. */
  async pending(user: User) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (spaceIds.length === 0) return { items: [] };
    const rows = await this.db
      .selectFrom('lt4ReadRequests as r')
      .innerJoin('pages as p', 'p.id', 'r.pageId')
      .innerJoin('spaces as s', 's.id', 'r.spaceId')
      .leftJoin('users as u', 'u.id', 'r.requestedById')
      .select([
        'r.id',
        'r.pageId',
        'r.message',
        'r.dueAt',
        'r.roundStartedAt',
        'p.title',
        'p.icon',
        'p.slugId',
        's.name as spaceName',
        's.slug as spaceSlug',
        'u.name as requestedByName',
      ])
      .where('r.workspaceId', '=', user.workspaceId)
      .where('r.spaceId', 'in', spaceIds)
      .where('p.deletedAt', 'is', null)
      .where('s.deletedAt', 'is', null)
      .where((eb) =>
        eb.or([eb('r.requestedById', 'is', null), eb('r.requestedById', '!=', user.id)]),
      )
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('lt4ReadConfirmations as c')
              .select('c.id')
              .whereRef('c.requestId', '=', 'r.id')
              .where('c.userId', '=', user.id)
              .where(sql<boolean>`c.confirmed_at >= r.round_started_at`),
          ),
        ),
      )
      .orderBy('r.roundStartedAt', 'desc')
      .limit(200)
      .execute();
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: rows.map((r) => r.pageId),
        userId: user.id,
      }),
    );
    return { items: rows.filter((r) => accessible.has(r.pageId)) };
  }
}
