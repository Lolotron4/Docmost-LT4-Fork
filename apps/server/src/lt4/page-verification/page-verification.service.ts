// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Seitenprüfung: Seiten als geprüft markieren (mit Ablauf) oder einen
// Freigabe-Workflow (Entwurf -> In Prüfung -> Freigegeben/Zurückgewiesen) nutzen.
// Die Tabellen page_verifications/page_verifiers und das automatische
// Zurücksetzen bei Änderungen liefert der AGPL-Kern.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Page, PageVerification, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { WsService } from '../../ws/ws.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

export type VerificationType = 'expiring' | 'qms';
export type PeriodUnit = 'day' | 'week' | 'month' | 'year';

/** Ab so vielen Tagen vor Ablauf gilt eine Prüfung als "läuft bald ab". */
export const EXPIRING_SOON_DAYS = 7;

export type VerificationState =
  | 'unverified'
  | 'verified'
  | 'expiring'
  | 'expired'
  | 'changed'
  | 'draft'
  | 'in_approval'
  | 'approved'
  | 'rejected';

export function verificationState(
  v: Pick<
    PageVerification,
    'type' | 'status' | 'verifiedAt' | 'expiresAt' | 'invalidatedAt'
  >,
  now = new Date(),
): VerificationState {
  if (v.type === 'qms') {
    const s = v.status as VerificationState;
    return ['in_approval', 'approved', 'rejected'].includes(s) ? s : 'draft';
  }
  if (!v.verifiedAt) return 'unverified';
  if (v.invalidatedAt) return 'changed';
  if (v.expiresAt) {
    const exp = new Date(v.expiresAt).getTime();
    if (exp <= now.getTime()) return 'expired';
    if (exp - now.getTime() <= EXPIRING_SOON_DAYS * 86400_000) return 'expiring';
  }
  return 'verified';
}

export function addPeriod(from: Date, amount: number, unit: PeriodUnit): Date {
  const d = new Date(from);
  switch (unit) {
    case 'day':
      d.setDate(d.getDate() + amount);
      break;
    case 'week':
      d.setDate(d.getDate() + amount * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + amount);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + amount);
      break;
  }
  return d;
}

type UserRef = { id: string; name: string | null; avatarUrl: string | null };

@Injectable()
export class PageVerificationService {
  private readonly logger = new Logger(PageVerificationService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    private readonly wsService: WsService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  // ---------- Hilfen ----------

  private async loadPage(pageId: string, user: User): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== user.workspaceId) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  private async isSpaceAdmin(page: Page, user: User): Promise<boolean> {
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  }

  private async canEdit(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user);
      return true;
    } catch {
      return false;
    }
  }

  private async findVerification(pageId: string) {
    return this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  private async verifierIds(verificationId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verificationId)
      .orderBy('createdAt')
      .execute();
    return rows.map((r) => r.userId);
  }

  private async usersByIds(ids: string[]): Promise<Map<string, UserRef>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'avatarUrl'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async permissions(
    page: Page,
    user: User,
    verification: PageVerification | undefined,
    verifiers: string[],
  ) {
    const spaceAdmin = await this.isSpaceAdmin(page, user);
    const canEdit = await this.canEdit(page, user);
    const isVerifier = verifiers.includes(user.id);
    // Einrichten darf, wer die Seite bearbeiten darf. Eine bestehende Prüfung
    // ändern oder entfernen nur Prüfer, Space-Admins und wer sie angelegt hat,
    // damit z. B. Schüler die Freigabe der Lehrkraft nicht einfach löschen.
    const canManage = verification
      ? spaceAdmin || isVerifier || (canEdit && verification.creatorId === user.id)
      : spaceAdmin || canEdit;
    return {
      canManage,
      canVerify: isVerifier,
      canRequest: canEdit,
      isVerifier,
    };
  }

  private async notifyChanged(page: Page) {
    try {
      await this.wsService.emitCommentEvent(page.spaceId, page.id, {
        operation: 'verificationUpdated',
        pageId: page.id,
      });
    } catch (err) {
      this.logger.warn(`verificationUpdated konnte nicht gesendet werden: ${err}`);
    }
  }

  private async queue(name: string, data: unknown) {
    try {
      await this.notificationQueue.add(name, data, { removeOnComplete: true });
    } catch (err) {
      this.logger.error(`Benachrichtigung ${name} fehlgeschlagen: ${err}`);
    }
  }

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

  /** Nur Nutzer mit Zugriff auf die Seite können Prüfer sein. */
  private async validVerifierIds(page: Page, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)].slice(0, 20);
    if (unique.length === 0) return [];
    const rows = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', 'in', unique)
      .where('workspaceId', '=', page.workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .execute();
    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      rows.map((r) => r.id),
      page.spaceId,
    );
    const allowed = await this.pagePermissionRepo.getUserIdsWithPageAccess(
      page.id,
      [...inSpace],
    );
    return unique.filter((id) => allowed.includes(id));
  }

  // ---------- Lesen ----------

  async getInfo(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    const verification = await this.findVerification(page.id);
    const verifiers = verification ? await this.verifierIds(verification.id) : [];
    const permissions = await this.permissions(page, user, verification, verifiers);

    if (!verification) {
      return { pageId: page.id, verification: null, verifiers: [], permissions };
    }

    const users = await this.usersByIds([
      ...verifiers,
      verification.verifiedById,
      verification.requestedById,
      verification.rejectedById,
      verification.invalidatedById,
    ]);
    const ref = (id: string | null) => (id ? (users.get(id) ?? null) : null);

    return {
      pageId: page.id,
      verification: {
        id: verification.id,
        type: verification.type as VerificationType,
        state: verificationState(verification),
        periodAmount: verification.periodAmount,
        periodUnit: verification.periodUnit as PeriodUnit | null,
        verifiedAt: verification.verifiedAt,
        verifiedBy: ref(verification.verifiedById),
        expiresAt: verification.expiresAt,
        requestedAt: verification.requestedAt,
        requestedBy: ref(verification.requestedById),
        rejectedAt: verification.rejectedAt,
        rejectedBy: ref(verification.rejectedById),
        rejectionComment: verification.rejectionComment,
        invalidatedAt: verification.invalidatedAt,
        invalidatedBy: ref(verification.invalidatedById),
        createdAt: verification.createdAt,
      },
      verifiers: verifiers.map((id) => users.get(id)).filter(Boolean),
      permissions,
    };
  }

  /** Nutzer, die als Prüfer in Frage kommen (Zugriff auf die Seite). */
  async candidates(pageId: string, query: string | undefined, user: User) {
    const page = await this.loadPage(pageId, user);
    let q = this.db
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
      .limit(200);
    if (query?.trim()) {
      q = q.where('users.name', 'ilike', `%${query.trim().replace(/[%_]/g, '')}%`);
    }
    const rows = await q.execute();
    const allowed = new Set(
      await this.pagePermissionRepo.getUserIdsWithPageAccess(
        page.id,
        rows.map((r) => r.id),
      ),
    );
    return rows.filter((r) => allowed.has(r.id));
  }

  // ---------- Einrichten / Ändern / Entfernen ----------

  async setup(
    dto: {
      pageId: string;
      type: VerificationType;
      verifierIds: string[];
      periodAmount?: number | null;
      periodUnit?: PeriodUnit | null;
    },
    user: User,
  ) {
    const page = await this.loadPage(dto.pageId, user);
    if (page.isBase) throw new BadRequestException('Bases cannot be verified');
    const existing = await this.findVerification(page.id);
    const currentVerifiers = existing ? await this.verifierIds(existing.id) : [];
    const perms = await this.permissions(page, user, existing, currentVerifiers);
    if (!perms.canManage) throw new ForbiddenException();

    const verifierIds = await this.validVerifierIds(page, dto.verifierIds ?? []);
    if (verifierIds.length === 0) {
      throw new BadRequestException('Choose at least one reviewer with access to the page');
    }

    const hasPeriod = dto.type === 'expiring' && !!dto.periodAmount && !!dto.periodUnit;
    const periodAmount = hasPeriod ? Math.min(Math.max(1, dto.periodAmount!), 1000) : null;
    const periodUnit = hasPeriod ? dto.periodUnit! : null;
    const now = new Date();

    await executeTx(this.db, async (trx) => {
      let id = existing?.id;
      if (!existing || existing.type !== dto.type) {
        // Neu oder Typwechsel: Zustand zurücksetzen
        const fresh = {
          type: dto.type,
          status: dto.type === 'qms' ? 'draft' : null,
          periodAmount,
          periodUnit,
          verifiedAt: null,
          verifiedById: null,
          expiresAt: null,
          requestedAt: null,
          requestedById: null,
          rejectedAt: null,
          rejectedById: null,
          rejectionComment: null,
          invalidatedAt: null,
          invalidatedById: null,
          verifiedHistoryId: null,
          rejectedHistoryId: null,
          updatedAt: now,
        };
        if (existing) {
          await trx.updateTable('pageVerifications').set(fresh).where('id', '=', existing.id).execute();
        } else {
          const row = await trx
            .insertInto('pageVerifications')
            .values({
              ...fresh,
              pageId: page.id,
              spaceId: page.spaceId,
              workspaceId: page.workspaceId,
              creatorId: user.id,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          id = row.id;
        }
      } else {
        // Gleicher Typ: nur Zeitraum anpassen. Bei geprüften Seiten das Ablaufdatum neu rechnen.
        const expiresAt =
          existing.type === 'expiring' && existing.verifiedAt
            ? hasPeriod
              ? addPeriod(new Date(existing.verifiedAt), periodAmount!, periodUnit!)
              : null
            : existing.expiresAt;
        await trx
          .updateTable('pageVerifications')
          .set({ periodAmount, periodUnit, expiresAt, updatedAt: now })
          .where('id', '=', existing.id)
          .execute();
      }

      await trx.deleteFrom('pageVerifiers').where('pageVerificationId', '=', id!).execute();
      await trx
        .insertInto('pageVerifiers')
        .values(
          verifierIds.map((userId, i) => ({
            pageVerificationId: id!,
            userId,
            isPrimary: i === 0,
            addedById: user.id,
          })),
        )
        .execute();
    });

    this.audit(
      existing ? AuditEvent.PAGE_VERIFICATION_UPDATED : AuditEvent.PAGE_VERIFICATION_CREATED,
      page,
      { type: dto.type, verifierIds, periodAmount, periodUnit },
    );
    await this.notifyChanged(page);
    return this.getInfo(page.id, user);
  }

  async remove(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    const existing = await this.findVerification(page.id);
    if (!existing) return { success: true };
    const verifiers = await this.verifierIds(existing.id);
    const perms = await this.permissions(page, user, existing, verifiers);
    if (!perms.canManage) throw new ForbiddenException();
    await this.db.deleteFrom('pageVerifications').where('id', '=', existing.id).execute();
    this.audit(AuditEvent.PAGE_VERIFICATION_REMOVED, page, { type: existing.type });
    await this.notifyChanged(page);
    return { success: true };
  }

  // ---------- Aktionen ----------

  private async loadForAction(pageId: string, user: User) {
    const page = await this.loadPage(pageId, user);
    const verification = await this.findVerification(page.id);
    if (!verification) throw new BadRequestException('This page has no review set up');
    const verifiers = await this.verifierIds(verification.id);
    const perms = await this.permissions(page, user, verification, verifiers);
    return { page, verification, verifiers, perms };
  }

  /** Geprüft-Typ: Seite (erneut) als geprüft markieren. */
  async verify(pageId: string, user: User) {
    const { page, verification, verifiers, perms } = await this.loadForAction(pageId, user);
    if (verification.type !== 'expiring') throw new BadRequestException('Use approve for approval workflows');
    if (!perms.canVerify) throw new ForbiddenException('Only reviewers can verify this page');

    const now = new Date();
    const expiresAt =
      verification.periodAmount && verification.periodUnit
        ? addPeriod(now, verification.periodAmount, verification.periodUnit as PeriodUnit)
        : null;
    await this.db
      .updateTable('pageVerifications')
      .set({
        verifiedAt: now,
        verifiedById: user.id,
        expiresAt,
        invalidatedAt: null,
        invalidatedById: null,
        verifiedHistoryId: null,
        updatedAt: now,
      })
      .where('id', '=', verification.id)
      .execute();

    this.audit(AuditEvent.PAGE_VERIFIED, page, { type: 'expiring', expiresAt });
    await this.queue(QueueJob.PAGE_VERIFIED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: verifiers.filter((id) => id !== user.id),
    });
    await this.notifyChanged(page);
    return this.getInfo(page.id, user);
  }

  /** Freigabe: zur Prüfung einreichen. */
  async requestApproval(pageId: string, user: User) {
    const { page, verification, verifiers, perms } = await this.loadForAction(pageId, user);
    if (verification.type !== 'qms') throw new BadRequestException('This page has no approval workflow');
    if (!perms.canRequest) throw new ForbiddenException();
    const state = verificationState(verification);
    if (state === 'in_approval') throw new BadRequestException('The page is already waiting for approval');
    if (state === 'approved') throw new BadRequestException('The page is already approved');

    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'in_approval',
        requestedAt: now,
        requestedById: user.id,
        invalidatedAt: null,
        invalidatedById: null,
        updatedAt: now,
      })
      .where('id', '=', verification.id)
      .execute();

    this.audit(AuditEvent.PAGE_APPROVAL_REQUESTED, page);
    await this.queue(QueueJob.PAGE_APPROVAL_REQUESTED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: verifiers.filter((id) => id !== user.id),
    });
    await this.notifyChanged(page);
    return this.getInfo(page.id, user);
  }

  /** Freigabe: Einreichung zurückziehen (Einreicher oder Prüfer). */
  async withdraw(pageId: string, user: User) {
    const { page, verification, perms } = await this.loadForAction(pageId, user);
    if (verification.type !== 'qms') throw new BadRequestException('This page has no approval workflow');
    if (verificationState(verification) !== 'in_approval') {
      throw new BadRequestException('The page is not waiting for approval');
    }
    if (verification.requestedById !== user.id && !perms.canVerify && !perms.canManage) {
      throw new ForbiddenException();
    }
    await this.db
      .updateTable('pageVerifications')
      .set({ status: 'draft', updatedAt: new Date() })
      .where('id', '=', verification.id)
      .execute();
    this.audit(AuditEvent.PAGE_VERIFICATION_UPDATED, page, { action: 'withdrawn' });
    await this.notifyChanged(page);
    return this.getInfo(page.id, user);
  }

  async approve(pageId: string, user: User) {
    const { page, verification, verifiers, perms } = await this.loadForAction(pageId, user);
    if (verification.type !== 'qms') throw new BadRequestException('Use verify for this page');
    if (!perms.canVerify) throw new ForbiddenException('Only reviewers can approve this page');
    if (verificationState(verification) !== 'in_approval') {
      throw new BadRequestException('The page is not waiting for approval');
    }
    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'approved',
        verifiedAt: now,
        verifiedById: user.id,
        rejectedAt: null,
        rejectedById: null,
        rejectionComment: null,
        invalidatedAt: null,
        invalidatedById: null,
        verifiedHistoryId: null,
        updatedAt: now,
      })
      .where('id', '=', verification.id)
      .execute();

    this.audit(AuditEvent.PAGE_VERIFIED, page, { type: 'qms' });
    // Einreicher und die übrigen Prüfer erfahren von der Freigabe
    const notify = [...verifiers, verification.requestedById].filter(
      (id): id is string => !!id && id !== user.id,
    );
    await this.queue(QueueJob.PAGE_VERIFIED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: [...new Set(notify)],
    });
    await this.notifyChanged(page);
    return this.getInfo(page.id, user);
  }

  async reject(pageId: string, comment: string | undefined, user: User) {
    const { page, verification, perms } = await this.loadForAction(pageId, user);
    if (verification.type !== 'qms') throw new BadRequestException('This page has no approval workflow');
    if (!perms.canVerify) throw new ForbiddenException('Only reviewers can return this page');
    if (verificationState(verification) !== 'in_approval') {
      throw new BadRequestException('The page is not waiting for approval');
    }
    const now = new Date();
    const text = comment?.trim().slice(0, 2000) || null;
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'rejected',
        rejectedAt: now,
        rejectedById: user.id,
        rejectionComment: text,
        updatedAt: now,
      })
      .where('id', '=', verification.id)
      .execute();

    this.audit(AuditEvent.PAGE_APPROVAL_REJECTED, page, { comment: text });
    if (verification.requestedById && verification.requestedById !== user.id) {
      await this.queue(QueueJob.PAGE_APPROVAL_REJECTED_NOTIFICATION, {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestedById: verification.requestedById,
        comment: text ?? undefined,
      });
    }
    await this.notifyChanged(page);
    return this.getInfo(page.id, user);
  }

  // ---------- Übersicht ----------

  async list(
    opts: { filter?: 'mine' | 'all'; state?: VerificationState; spaceId?: string },
    user: User,
  ) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (spaceIds.length === 0) return { items: [] };

    let q = this.db
      .selectFrom('pageVerifications as v')
      .innerJoin('pages as p', 'p.id', 'v.pageId')
      .innerJoin('spaces as s', 's.id', 'v.spaceId')
      .select([
        'v.id',
        'v.pageId',
        'v.spaceId',
        'v.type',
        'v.status',
        'v.verifiedAt',
        'v.expiresAt',
        'v.requestedAt',
        'v.requestedById',
        'v.rejectedAt',
        'v.invalidatedAt',
        'v.updatedAt',
        'p.title',
        'p.icon',
        'p.slugId',
        's.name as spaceName',
        's.slug as spaceSlug',
      ])
      .where('v.workspaceId', '=', user.workspaceId)
      .where('v.spaceId', 'in', spaceIds)
      .where('p.deletedAt', 'is', null)
      .where('s.deletedAt', 'is', null)
      .orderBy('v.updatedAt', 'desc')
      .limit(500);

    if (opts.spaceId) q = q.where('v.spaceId', '=', opts.spaceId);
    if (opts.filter === 'mine') {
      q = q.where((eb) =>
        eb.or([
          eb(
            'v.id',
            'in',
            eb
              .selectFrom('pageVerifiers')
              .select('pageVerificationId')
              .where('userId', '=', user.id),
          ),
          eb('v.requestedById', '=', user.id),
        ]),
      );
    }

    const rows = await q.execute();

    // Seiten mit Einschränkungen, auf die der Nutzer keinen Zugriff hat, ausblenden
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: rows.map((r) => r.pageId),
        userId: user.id,
      }),
    );
    const visible = rows.filter((r) => accessible.has(r.pageId));

    const allVerifiers = visible.length
      ? await this.db
          .selectFrom('pageVerifiers')
          .select(['pageVerificationId', 'userId'])
          .where(
            'pageVerificationId',
            'in',
            visible.map((r) => r.id),
          )
          .execute()
      : [];
    const users = await this.usersByIds([
      ...allVerifiers.map((v) => v.userId),
      ...visible.map((r) => r.requestedById),
    ]);

    const now = new Date();
    let items = visible.map((r) => {
      const verifierIds = allVerifiers
        .filter((v) => v.pageVerificationId === r.id)
        .map((v) => v.userId);
      return {
        id: r.id,
        pageId: r.pageId,
        spaceId: r.spaceId,
        spaceName: r.spaceName,
        spaceSlug: r.spaceSlug,
        title: r.title,
        icon: r.icon,
        slugId: r.slugId,
        type: r.type as VerificationType,
        state: verificationState(r as any, now),
        verifiedAt: r.verifiedAt,
        expiresAt: r.expiresAt,
        requestedAt: r.requestedAt,
        requestedBy: r.requestedById ? (users.get(r.requestedById) ?? null) : null,
        updatedAt: r.updatedAt,
        verifiers: verifierIds.map((id) => users.get(id)).filter(Boolean),
        isVerifier: verifierIds.includes(user.id),
      };
    });
    if (opts.state) items = items.filter((i) => i.state === opts.state);
    return { items };
  }
}
