// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Aufgaben: Übersicht "Meine Aufgaben", "Von mir vergeben" und Abhaken aus der Übersicht.
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';

export type TaskListMode = 'mine' | 'assigned';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  private baseQuery(user: User) {
    return this.db
      .selectFrom('lt4Tasks as t')
      .innerJoin('pages as p', 'p.id', 't.pageId')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .innerJoin('users as a', 'a.id', 't.assigneeId')
      .leftJoin('users as b', 'b.id', 't.assignedById')
      .select([
        't.id',
        't.pageId',
        't.itemId',
        't.text',
        't.checked',
        sql<string | null>`t.due_date::text`.as('dueDate'),
        't.completedAt',
        't.createdAt',
        'p.title as pageTitle',
        'p.icon as pageIcon',
        'p.slugId as pageSlugId',
        'p.spaceId as spaceId',
        's.name as spaceName',
        's.slug as spaceSlug',
        'a.id as assigneeId',
        'a.name as assigneeName',
        'a.avatarUrl as assigneeAvatarUrl',
        'b.id as assignedById',
        'b.name as assignedByName',
        'b.avatarUrl as assignedByAvatarUrl',
      ])
      .where('t.workspaceId', '=', user.workspaceId)
      .where('p.deletedAt', 'is', null)
      .where('s.deletedAt', 'is', null);
  }

  async list(user: User, mode: TaskListMode, status: 'open' | 'done') {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (spaceIds.length === 0) return { items: [] };

    let q = this.baseQuery(user)
      .where('p.spaceId', 'in', spaceIds)
      .where('t.checked', '=', status === 'done');
    if (mode === 'mine') {
      q = q.where('t.assigneeId', '=', user.id);
    } else {
      q = q.where('t.assignedById', '=', user.id).where('t.assigneeId', '!=', user.id);
    }
    q =
      status === 'done'
        ? q.orderBy('t.completedAt', (ob) => ob.desc().nullsLast())
        : q
            .orderBy('t.dueDate', (ob) => ob.asc().nullsLast())
            .orderBy('t.createdAt', 'desc');

    const rows = await q.limit(500).execute();
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(rows.map((r) => r.pageId))],
        userId: user.id,
      }),
    );
    return { items: rows.filter((r) => accessible.has(r.pageId)) };
  }

  /** Zähler für die Seitenleiste: offen, davon heute fällig oder überfällig. */
  async counts(user: User, today: string) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (spaceIds.length === 0) return { open: 0, due: 0 };
    const rows = await this.db
      .selectFrom('lt4Tasks as t')
      .innerJoin('pages as p', 'p.id', 't.pageId')
      .select(['t.pageId', sql<string | null>`t.due_date::text`.as('dueDate')])
      .where('t.assigneeId', '=', user.id)
      .where('t.checked', '=', false)
      .where('p.deletedAt', 'is', null)
      .where('p.spaceId', 'in', spaceIds)
      .limit(1000)
      .execute();
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(rows.map((r) => r.pageId))],
        userId: user.id,
      }),
    );
    const visible = rows.filter((r) => accessible.has(r.pageId));
    return {
      open: visible.length,
      due: visible.filter((r) => r.dueDate && r.dueDate <= today).length,
    };
  }

  /**
   * Abhaken/Wieder öffnen. Erlaubt für die zugewiesene Person (auch mit nur
   * Leserecht, es ist ja ihre Aufgabe) und alle, die die Seite bearbeiten dürfen.
   */
  async setChecked(id: string, checked: boolean, user: User) {
    const task = await this.db
      .selectFrom('lt4Tasks')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', user.workspaceId)
      .executeTakeFirst();
    if (!task) throw new NotFoundException('Task not found');
    const page = await this.pageRepo.findById(task.pageId);
    if (!page || page.deletedAt) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanView(page, user);
    if (task.assigneeId !== user.id) {
      try {
        await this.pageAccessService.validateCanEdit(page, user);
      } catch {
        throw new ForbiddenException();
      }
    }

    const found = await this.collaborationGateway.handleYjsEvent(
      'lt4SetTaskChecked',
      `page.${page.id}`,
      { itemId: task.itemId, checked, user },
    );
    if (found === false) {
      // Eintrag gibt es nicht mehr (z. B. gerade gelöscht)
      throw new NotFoundException('Task no longer exists on the page');
    }

    // Sofort sichtbar machen; der nächste Seiten-Speicherlauf gleicht erneut ab.
    const now = new Date();
    await this.db
      .updateTable('lt4Tasks')
      .set({ checked, completedAt: checked ? now : null, updatedAt: now })
      .where('pageId', '=', task.pageId)
      .where('itemId', '=', task.itemId)
      .execute();
    return { success: true, checked };
  }
}
