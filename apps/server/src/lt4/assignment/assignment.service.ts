// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Abgaben für Gruppenarbeit.
//
// Eine Lehrkraft verteilt eine Vorlage (oder eine leere Seite) an Gruppen oder
// einzelne Personen. Jede Gruppe bekommt eine eigene, eingeschränkte Seite unter
// einer Sammelseite: die Gruppe darf bearbeiten, die Lehrkraft auch, sonst
// niemand. Nach der Frist (oder wenn die Gruppe "Abgeben" drückt) wird die
// Gruppe auf "nur lesen" gesetzt.
//
// Gesperrt wird über die vorhandenen Seitenrechte (Rolle writer -> reader).
// Damit greift die Sperre überall, wo der Kern Bearbeitungsrechte prüft
// (Editor/Collab, API, Titel, Verschieben ...), ohne Eingriffe in den Kern.
//
// Verwalten (freischalten, verlängern, jetzt sperren) dürfen die Person, die die
// Abgabe angelegt hat, und alle mit dem Rollenrecht "assignments".
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageService } from '../../core/page/services/page.service';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  PageAccessLevel,
  PagePermissionRole,
} from '../../common/helpers/types/permission';
import { CacheKey } from '../../common/helpers/cache-keys';
import { WS_SPACE_RESTRICTION_CACHE_PREFIX } from '../../ws/ws.utils';
import { CollabAccessService } from '../../collaboration/services/collab-access.service';
import { jsonToText } from '../../collaboration/collaboration.util';
import { createYdocFromJson } from '../../common/helpers/prosemirror/utils';
import { TemplateAccessService } from '../template/template-access.service';
import { TemplateService } from '../template/template.service';
import { hasPermission } from '../roles/role-store';
import {
  CreateAssignmentDto,
  SubmissionActionDto,
  UpdateAssignmentDto,
} from './assignment.dto';

export type SubmissionState =
  | 'open' // vor der Frist, bearbeitbar
  | 'submitted' // von der Gruppe abgegeben, gesperrt
  | 'locked' // Frist abgelaufen, gesperrt
  | 'overdue' // Frist abgelaufen, aber nicht gesperrt (Sperre aus)
  | 'unlocked'; // nach Ablauf freigeschaltet, ohne neue Frist

type AssignmentRow = {
  id: string;
  workspaceId: string;
  spaceId: string;
  templateId: string | null;
  parentPageId: string | null;
  title: string;
  description: string | null;
  dueAt: Date;
  lockAfterDue: boolean;
  allowSubmit: boolean;
  creatorId: string | null;
  createdAt: Date;
};

type SubmissionRow = {
  id: string;
  assignmentId: string;
  workspaceId: string;
  pageId: string;
  groupId: string | null;
  userId: string | null;
  dueAt: Date | null;
  lockDisabled: boolean;
  submittedAt: Date | null;
  submittedById: string | null;
  lockedAt: Date | null;
};

const RECONCILE_MS = 60_000;

const ts = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

@Injectable()
export class AssignmentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssignmentService.name);
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly templateAccess: TemplateAccessService,
    private readonly templateService: TemplateService,
    private readonly collabAccess: CollabAccessService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ------------------------------------------------------------ Zeitplan

  onModuleInit() {
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_MS);
    this.timer.unref?.();
    setTimeout(() => void this.reconcile(), 5_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sperrt alle Seiten, deren Frist abgelaufen ist. Mehrfaches Ausführen schadet nicht. */
  async reconcile(): Promise<number> {
    if (this.reconciling) return 0;
    this.reconciling = true;
    try {
      const due = await this.db
        .selectFrom('lt4AssignmentSubmissions as s')
        .innerJoin('lt4Assignments as a', 'a.id', 's.assignmentId')
        .selectAll('s')
        .where('a.lockAfterDue', '=', true)
        .where('s.lockDisabled', '=', false)
        .where('s.lockedAt', 'is', null)
        .where(sql<boolean>`coalesce(s.due_at, a.due_at) <= now()`)
        .limit(500)
        .execute();
      for (const s of due as unknown as SubmissionRow[]) {
        try {
          await this.applyLock(s, true);
        } catch (err) {
          this.logger.error(`Abgabe ${s.id} konnte nicht gesperrt werden: ${err}`);
        }
      }
      if (due.length) this.logger.log(`${due.length} Abgabe-Seiten nach Fristende gesperrt`);
      return due.length;
    } catch (err) {
      this.logger.error(`Abgaben prüfen fehlgeschlagen: ${err}`);
      return 0;
    } finally {
      this.reconciling = false;
    }
  }

  // ------------------------------------------------------------ Hilfen

  private canManageAll(user: User) {
    return hasPermission(user, 'assignments');
  }

  private canManage(assignment: AssignmentRow, user: User) {
    return assignment.creatorId === user.id || this.canManageAll(user);
  }

  private async loadAssignment(id: string, user: User): Promise<AssignmentRow> {
    const a = await this.db
      .selectFrom('lt4Assignments')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', user.workspaceId)
      .executeTakeFirst();
    if (!a) throw new NotFoundException('Assignment not found');
    return a as unknown as AssignmentRow;
  }

  private async loadManageable(id: string, user: User) {
    const a = await this.loadAssignment(id, user);
    if (!this.canManage(a, user)) throw new ForbiddenException();
    return a;
  }

  private effectiveDue(a: AssignmentRow, s: SubmissionRow): Date {
    return new Date(s.dueAt ?? a.dueAt);
  }

  private stateOf(a: AssignmentRow, s: SubmissionRow): SubmissionState {
    if (s.lockedAt) return s.submittedAt ? 'submitted' : 'locked';
    const due = this.effectiveDue(a, s).getTime();
    if (due > Date.now()) return 'open';
    return s.lockDisabled ? 'unlocked' : 'overdue';
  }

  private async userIdsOf(s: { groupId: string | null; userId: string | null }) {
    if (s.userId) return [s.userId];
    if (!s.groupId) return [];
    const rows = await this.db
      .selectFrom('groupUsers')
      .select('userId')
      .where('groupId', '=', s.groupId)
      .execute();
    return rows.map((r) => r.userId);
  }

  private async isTarget(s: SubmissionRow, userId: string) {
    if (s.userId) return s.userId === userId;
    if (!s.groupId) return false;
    const row = await this.db
      .selectFrom('groupUsers')
      .select('userId')
      .where('groupId', '=', s.groupId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    return !!row;
  }

  /** Setzt die Gruppe/Person auf der Seite auf Lesen (sperren) oder Bearbeiten. */
  private async setTargetRole(s: SubmissionRow, role: PagePermissionRole) {
    const access = await this.pagePermissionRepo.findPageAccessByPageId(s.pageId);
    if (!access) return;
    const target = s.groupId ? { groupId: s.groupId } : s.userId ? { userId: s.userId } : null;
    if (!target) return;
    await this.pagePermissionRepo.updatePagePermissionRole(access.id, role, target as any);

    const page = await this.pageRepo.findById(s.pageId);
    const userIds = await this.userIdsOf(s);
    const keys = [
      ...(page ? [`${WS_SPACE_RESTRICTION_CACHE_PREFIX}${page.spaceId}`] : []),
      ...userIds.map((u) => CacheKey.PAGE_CAN_EDIT(u, s.pageId)),
    ];
    await Promise.all(keys.map((k) => this.cacheManager.del(k).catch(() => undefined)));
    // Offene Editoren sofort auf "nur lesen" stellen (Freischalten braucht Neuladen)
    await this.collabAccess.recheckAccess({ pageIds: [s.pageId] });
  }

  private async applyLock(s: SubmissionRow, lock: boolean, patch: Record<string, unknown> = {}) {
    await this.setTargetRole(s, lock ? PagePermissionRole.READER : PagePermissionRole.WRITER);
    await this.db
      .updateTable('lt4AssignmentSubmissions')
      .set({
        lockedAt: lock ? new Date() : null,
        ...(lock ? {} : { submittedAt: null, submittedById: null }),
        ...patch,
        updatedAt: new Date(),
      } as any)
      .where('id', '=', s.id)
      .execute();
  }

  // ------------------------------------------------------------ Optionen

  /** Bereiche, in denen ich Seiten anlegen darf, und alle Gruppen. */
  async options(user: User) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    const spaces: { id: string; name: string; slug: string }[] = [];
    if (spaceIds.length) {
      const rows = await this.db
        .selectFrom('spaces')
        .select(['id', 'name', 'slug'])
        .where('id', 'in', spaceIds)
        .where('deletedAt', 'is', null)
        .orderBy('name')
        .execute();
      for (const s of rows) {
        const ability = await this.spaceAbility.createForUser(user, s.id);
        if (ability.can(SpaceCaslAction.Create, SpaceCaslSubject.Page)) spaces.push(s as any);
      }
    }
    const groups = await this.db
      .selectFrom('groups')
      .leftJoin('groupUsers', 'groupUsers.groupId', 'groups.id')
      .select(['groups.id', 'groups.name'])
      .select((eb) => eb.fn.count<number>('groupUsers.userId').as('memberCount'))
      .where('groups.workspaceId', '=', user.workspaceId)
      // Standardgruppe "Everyone" ergibt als Abgabe-Gruppe keinen Sinn
      .where('groups.isDefault', '=', false)
      .groupBy(['groups.id', 'groups.name'])
      .orderBy('groups.name')
      .execute();
    return {
      canManageAll: this.canManageAll(user),
      spaces,
      groups: groups.map((g) => ({ ...g, memberCount: Number(g.memberCount) })),
    };
  }

  // ------------------------------------------------------------ Anlegen

  async create(user: User, workspace: Workspace, dto: CreateAssignmentDto) {
    const groupIds = [...new Set(dto.groupIds ?? [])];
    const userIds = [...new Set(dto.userIds ?? [])];
    if (!groupIds.length && !userIds.length) {
      throw new BadRequestException('Select at least one group or person');
    }
    if (groupIds.length + userIds.length > 100) {
      throw new BadRequestException('Too many groups');
    }
    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('Invalid deadline');

    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    if (dto.parentPageId) {
      const parent = await this.pageRepo.findById(dto.parentPageId);
      if (!parent || parent.deletedAt || parent.spaceId !== dto.spaceId) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccess.validateCanEdit(parent, user);
    }

    const template = dto.templateId
      ? await this.templateAccess.findViewableTemplate(dto.templateId, user, workspace, true)
      : null;

    const groups = groupIds.length
      ? await this.db
          .selectFrom('groups')
          .select(['id', 'name'])
          .where('id', 'in', groupIds)
          .where('workspaceId', '=', workspace.id)
          .execute()
      : [];
    const users = userIds.length
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name'])
          .where('id', 'in', userIds)
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .execute()
      : [];
    if (groups.length !== groupIds.length || users.length !== userIds.length) {
      throw new BadRequestException('Unknown group or person');
    }

    const title = dto.title.trim();
    const description = dto.description?.trim() || null;

    // Sammelseite (für alle im Bereich sichtbar) mit Aufgabenbeschreibung
    const parent = await this.pageService.create(user.id, workspace.id, {
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      title,
      icon: template?.icon ?? '📥',
    });
    await this.writeContent(parent.id, this.collectionContent(description, dueAt));

    const assignment = await this.db
      .insertInto('lt4Assignments')
      .values({
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        templateId: template?.id ?? null,
        parentPageId: parent.id,
        title,
        description,
        dueAt,
        lockAfterDue: dto.lockAfterDue ?? true,
        allowSubmit: dto.allowSubmit ?? true,
        creatorId: user.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const targets = [
      ...groups.map((g) => ({ groupId: g.id, userId: null as string | null, name: g.name })),
      ...users.map((u) => ({ groupId: null as string | null, userId: u.id, name: u.name })),
    ];
    for (const target of targets) {
      const pageTitle = `${title} – ${target.name ?? ''}`.trim();
      const page = template
        ? await this.templateService.createPageUnchecked(user, workspace, template, {
            spaceId: dto.spaceId,
            parentPageId: parent.id,
            title: pageTitle,
          })
        : await this.pageService.create(user.id, workspace.id, {
            spaceId: dto.spaceId,
            parentPageId: parent.id,
            title: pageTitle,
          });

      // Seite einschränken: Lehrkraft + Gruppe bearbeiten, sonst niemand
      const access = await this.pagePermissionRepo.insertPageAccess({
        pageId: page.id,
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        accessLevel: PageAccessLevel.RESTRICTED,
        creatorId: user.id,
      });
      await this.pagePermissionRepo.insertPagePermissions([
        { pageAccessId: access.id, userId: user.id, role: PagePermissionRole.WRITER, addedById: user.id },
        {
          pageAccessId: access.id,
          ...(target.groupId ? { groupId: target.groupId } : { userId: target.userId }),
          role: PagePermissionRole.WRITER,
          addedById: user.id,
        } as any,
      ]);

      await this.db
        .insertInto('lt4AssignmentSubmissions')
        .values({
          assignmentId: assignment.id,
          workspaceId: workspace.id,
          pageId: page.id,
          groupId: target.groupId,
          userId: target.userId,
        })
        .execute();
    }

    await this.cacheManager
      .del(`${WS_SPACE_RESTRICTION_CACHE_PREFIX}${dto.spaceId}`)
      .catch(() => undefined);

    // Frist schon vorbei? Dann gleich sperren
    if (dueAt.getTime() <= Date.now()) await this.reconcile();
    return this.info(assignment.id, user);
  }

  private collectionContent(description: string | null, dueAt: Date) {
    const paragraphs = (description ?? '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }));
    return {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { type: 'info' },
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Abgabe für Gruppenarbeit. Jede Gruppe findet ihre eigene Seite unter dieser Seite. Abgabefrist: ',
                },
                {
                  type: 'text',
                  marks: [{ type: 'bold' }],
                  text: dueAt.toLocaleString('de-DE', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: process.env.LT4_TIMEZONE || 'Europe/Berlin',
                  }),
                },
              ],
            },
          ],
        },
        ...paragraphs,
      ],
    };
  }

  private async writeContent(pageId: string, content: any) {
    try {
      const parsed = await this.pageService.parseProsemirrorContent(content, 'json');
      await this.pageRepo.updatePage(
        {
          content: parsed,
          textContent: jsonToText(parsed),
          ydoc: createYdocFromJson(parsed),
        } as any,
        pageId,
      );
    } catch (err) {
      this.logger.warn(`Inhalt der Sammelseite konnte nicht gesetzt werden: ${err}`);
    }
  }

  // ------------------------------------------------------------ Lesen

  private async submissionsOf(assignment: AssignmentRow) {
    const rows = (await this.db
      .selectFrom('lt4AssignmentSubmissions as s')
      .innerJoin('pages as p', 'p.id', 's.pageId')
      .leftJoin('groups as g', 'g.id', 's.groupId')
      .leftJoin('users as u', 'u.id', 's.userId')
      .leftJoin('users as sb', 'sb.id', 's.submittedById')
      .selectAll('s')
      .select([
        'p.slugId as pageSlugId',
        'p.title as pageTitle',
        'p.updatedAt as pageUpdatedAt',
        'p.deletedAt as pageDeletedAt',
        'g.name as groupName',
        'u.name as userName',
        'sb.name as submittedByName',
      ])
      .where('s.assignmentId', '=', assignment.id)
      .orderBy(sql`coalesce(g.name, u.name)`)
      .execute()) as any[];
    return rows
      .filter((r) => !r.pageDeletedAt)
      .map((r) => ({
        id: r.id,
        pageId: r.pageId,
        pageSlugId: r.pageSlugId,
        pageTitle: r.pageTitle,
        pageUpdatedAt: r.pageUpdatedAt,
        target: r.groupId
          ? { type: 'group' as const, id: r.groupId, name: r.groupName }
          : { type: 'user' as const, id: r.userId, name: r.userName },
        dueAt: this.effectiveDue(assignment, r),
        hasOwnDue: !!r.dueAt,
        lockDisabled: r.lockDisabled,
        submittedAt: r.submittedAt,
        submittedByName: r.submittedByName,
        lockedAt: r.lockedAt,
        state: this.stateOf(assignment, r),
      }));
  }

  private async summary(a: AssignmentRow, user: User) {
    const space = await this.db
      .selectFrom('spaces')
      .select(['name', 'slug'])
      .where('id', '=', a.spaceId)
      .executeTakeFirst();
    const parent = a.parentPageId
      ? await this.db
          .selectFrom('pages')
          .select(['slugId', 'deletedAt'])
          .where('id', '=', a.parentPageId)
          .executeTakeFirst()
      : null;
    const creator = a.creatorId
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name', 'avatarUrl'])
          .where('id', '=', a.creatorId)
          .executeTakeFirst()
      : null;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      dueAt: a.dueAt,
      lockAfterDue: a.lockAfterDue,
      allowSubmit: a.allowSubmit,
      templateId: a.templateId,
      spaceId: a.spaceId,
      spaceName: space?.name ?? null,
      spaceSlug: space?.slug ?? null,
      parentPageSlugId: parent && !parent.deletedAt ? parent.slugId : null,
      createdAt: a.createdAt,
      creator: creator ?? null,
      canManage: this.canManage(a, user),
    };
  }

  async info(assignmentId: string, user: User) {
    const a = await this.loadManageable(assignmentId, user);
    return { ...(await this.summary(a, user)), submissions: await this.submissionsOf(a) };
  }

  /** Abgaben, die ich verwalte (eigene oder alle mit Rollenrecht). */
  async list(user: User, scope: 'mine' | 'all' = 'mine') {
    let q = this.db
      .selectFrom('lt4Assignments')
      .selectAll()
      .where('workspaceId', '=', user.workspaceId)
      .orderBy('dueAt', 'desc')
      .limit(200);
    if (scope === 'all' && this.canManageAll(user)) {
      // alle
    } else {
      q = q.where('creatorId', '=', user.id);
    }
    const rows = (await q.execute()) as unknown as AssignmentRow[];
    const items = [];
    for (const a of rows) {
      const subs = await this.submissionsOf(a);
      const counts: Record<SubmissionState, number> = {
        open: 0,
        submitted: 0,
        locked: 0,
        overdue: 0,
        unlocked: 0,
      };
      for (const s of subs) counts[s.state]++;
      items.push({ ...(await this.summary(a, user)), total: subs.length, counts });
    }
    return { items, canManageAll: this.canManageAll(user) };
  }

  /** Abgaben, an denen ich (oder eine meiner Gruppen) arbeite. */
  async todo(user: User) {
    const rows = (await this.db
      .selectFrom('lt4AssignmentSubmissions as s')
      .innerJoin('lt4Assignments as a', 'a.id', 's.assignmentId')
      .innerJoin('pages as p', 'p.id', 's.pageId')
      .innerJoin('spaces as sp', 'sp.id', 'a.spaceId')
      .leftJoin('groups as g', 'g.id', 's.groupId')
      .selectAll('s')
      .select([
        'a.title as assignmentTitle',
        'a.dueAt as assignmentDueAt',
        'a.lockAfterDue',
        'a.allowSubmit',
        'p.slugId as pageSlugId',
        'p.title as pageTitle',
        'sp.name as spaceName',
        'sp.slug as spaceSlug',
        'g.name as groupName',
      ])
      .where('s.workspaceId', '=', user.workspaceId)
      .where('p.deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('s.userId', '=', user.id),
          eb(
            's.groupId',
            'in',
            eb.selectFrom('groupUsers').select('groupId').where('userId', '=', user.id),
          ),
        ]),
      )
      .orderBy(sql`coalesce(s.due_at, a.due_at)`, 'asc')
      .limit(200)
      .execute()) as any[];
    return {
      items: rows.map((r) => {
        const a = { dueAt: r.assignmentDueAt } as AssignmentRow;
        return {
          id: r.id,
          assignmentId: r.assignmentId,
          title: r.assignmentTitle,
          pageId: r.pageId,
          pageSlugId: r.pageSlugId,
          pageTitle: r.pageTitle,
          spaceName: r.spaceName,
          spaceSlug: r.spaceSlug,
          groupName: r.groupName,
          dueAt: this.effectiveDue(a, r),
          submittedAt: r.submittedAt,
          state: this.stateOf(a, r),
        };
      }),
    };
  }

  /** Infos für die Hinweisleiste auf einer Seite (null = keine Abgabe-Seite). */
  async pageInfo(pageId: string, user: User) {
    const s = (await this.db
      .selectFrom('lt4AssignmentSubmissions')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', user.workspaceId)
      .executeTakeFirst()) as unknown as SubmissionRow | undefined;
    if (!s) return { assignment: null };
    const page = await this.pageRepo.findById(pageId);
    if (!page) return { assignment: null };
    await this.pageAccess.validateCanView(page, user);
    const a = await this.loadAssignment(s.assignmentId, user);
    const isMember = await this.isTarget(s, user.id);
    const state = this.stateOf(a, s);
    const target = s.groupId
      ? await this.db.selectFrom('groups').select('name').where('id', '=', s.groupId).executeTakeFirst()
      : await this.db.selectFrom('users').select('name').where('id', '=', s.userId!).executeTakeFirst();
    return {
      assignment: {
        id: a.id,
        title: a.title,
        description: a.description,
        lockAfterDue: a.lockAfterDue,
        allowSubmit: a.allowSubmit,
      },
      submission: {
        id: s.id,
        dueAt: this.effectiveDue(a, s),
        state,
        submittedAt: s.submittedAt,
        lockedAt: s.lockedAt,
        targetName: target?.name ?? null,
        targetType: s.groupId ? 'group' : 'user',
      },
      isMember,
      canManage: this.canManage(a, user),
      canSubmit: isMember && a.allowSubmit && state === 'open',
    };
  }

  // ------------------------------------------------------------ Aktionen

  private async loadSubmission(id: string, user: User) {
    const s = (await this.db
      .selectFrom('lt4AssignmentSubmissions')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', user.workspaceId)
      .executeTakeFirst()) as unknown as SubmissionRow | undefined;
    if (!s) throw new NotFoundException('Submission not found');
    return s;
  }

  /** Gruppe gibt vor der Frist ab: Seite wird für sie nur lesbar. */
  async submit(submissionId: string, user: User) {
    const s = await this.loadSubmission(submissionId, user);
    const a = await this.loadAssignment(s.assignmentId, user);
    if (!a.allowSubmit) throw new BadRequestException('Submitting is turned off');
    if (!(await this.isTarget(s, user.id))) throw new ForbiddenException();
    if (s.lockedAt) throw new BadRequestException('Already locked');
    await this.applyLock(s, true, { submittedAt: new Date(), submittedById: user.id });
    return this.pageInfo(s.pageId, user);
  }

  private async manageable(dto: SubmissionActionDto, user: User) {
    const ids = [...new Set(dto.submissionIds)];
    if (!ids.length) throw new BadRequestException('Nothing selected');
    const subs: SubmissionRow[] = [];
    const assignments = new Map<string, AssignmentRow>();
    for (const id of ids) {
      const s = await this.loadSubmission(id, user);
      let a = assignments.get(s.assignmentId);
      if (!a) {
        a = await this.loadManageable(s.assignmentId, user);
        assignments.set(a.id, a);
      }
      subs.push(s);
    }
    return { subs, assignments };
  }

  /**
   * Freischalten: wieder bearbeitbar. Mit neuer Frist wird danach erneut
   * gesperrt, ohne Frist bleibt die Seite offen, bis jemand sie sperrt.
   */
  async unlock(dto: SubmissionActionDto, user: User) {
    const { subs } = await this.manageable(dto, user);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && dueAt.getTime() <= Date.now()) {
      throw new BadRequestException('The new deadline must be in the future');
    }
    for (const s of subs) {
      await this.applyLock(s, false, {
        lockDisabled: !dueAt,
        ...(dueAt ? { dueAt } : {}),
      });
    }
    return { updated: subs.length };
  }

  /** Frist verlängern (auch vor Ablauf). Gesperrte Seiten werden dabei freigeschaltet. */
  async extend(dto: SubmissionActionDto, user: User) {
    if (!dto.dueAt) throw new BadRequestException('Deadline missing');
    const dueAt = new Date(dto.dueAt);
    if (dueAt.getTime() <= Date.now()) {
      throw new BadRequestException('The new deadline must be in the future');
    }
    const { subs } = await this.manageable(dto, user);
    for (const s of subs) {
      if (s.lockedAt) {
        await this.applyLock(s, false, { dueAt, lockDisabled: false });
      } else {
        await this.db
          .updateTable('lt4AssignmentSubmissions')
          .set({ dueAt, lockDisabled: false, updatedAt: new Date() })
          .where('id', '=', s.id)
          .execute();
      }
    }
    return { updated: subs.length };
  }

  /** Sofort sperren (z. B. nach Freischalten ohne Frist). */
  async lockNow(dto: SubmissionActionDto, user: User) {
    const { subs } = await this.manageable(dto, user);
    for (const s of subs) {
      // Eigene Frist "jetzt", damit eine spätere Änderung der gemeinsamen Frist sie nicht wieder öffnet
      if (!s.lockedAt) await this.applyLock(s, true, { dueAt: new Date(), lockDisabled: false });
    }
    return { updated: subs.length };
  }

  async update(dto: UpdateAssignmentDto, user: User) {
    const a = await this.loadManageable(dto.assignmentId, user);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new BadRequestException('Title missing');
      patch.title = dto.title.trim();
    }
    if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
    if (dto.lockAfterDue !== undefined) patch.lockAfterDue = dto.lockAfterDue;
    if (dto.allowSubmit !== undefined) patch.allowSubmit = dto.allowSubmit;
    let newDue: Date | null = null;
    if (dto.dueAt) {
      newDue = new Date(dto.dueAt);
      if (Number.isNaN(newDue.getTime())) throw new BadRequestException('Invalid deadline');
      patch.dueAt = newDue;
    }
    await this.db.updateTable('lt4Assignments').set(patch as any).where('id', '=', a.id).execute();

    // Neue gemeinsame Frist in der Zukunft: nach Fristende gesperrte Seiten
    // ohne eigene Frist wieder öffnen (abgegebene bleiben gesperrt).
    if (newDue && newDue.getTime() > Date.now()) {
      const subs = (await this.db
        .selectFrom('lt4AssignmentSubmissions')
        .selectAll()
        .where('assignmentId', '=', a.id)
        .where('dueAt', 'is', null)
        .where('lockedAt', 'is not', null)
        .where('submittedAt', 'is', null)
        .execute()) as unknown as SubmissionRow[];
      for (const s of subs) await this.applyLock(s, false, { lockDisabled: false });
    }
    await this.reconcile();
    return this.info(a.id, user);
  }

  /** Abgabe entfernen. Die Seiten bleiben erhalten; gesperrte werden wieder bearbeitbar. */
  async remove(assignmentId: string, user: User, reopen = true) {
    const a = await this.loadManageable(assignmentId, user);
    if (reopen) {
      const subs = (await this.db
        .selectFrom('lt4AssignmentSubmissions')
        .selectAll()
        .where('assignmentId', '=', a.id)
        .where('lockedAt', 'is not', null)
        .execute()) as unknown as SubmissionRow[];
      for (const s of subs) await this.setTargetRole(s, PagePermissionRole.WRITER);
    }
    await this.db.deleteFrom('lt4Assignments').where('id', '=', a.id).execute();
    return { success: true };
  }
}
