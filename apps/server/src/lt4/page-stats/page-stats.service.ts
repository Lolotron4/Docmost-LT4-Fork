// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Seitenstatistik und veraltete Seiten.
//
// Aufrufe werden je Seite, Person und Tag gezählt (eine Zeile pro Tag). Wer eine
// Seite bearbeiten darf, sieht Zahlen ohne Namen. Namen der Lesenden sieht nur,
// wer das Rollenrecht "page_stats" hat (Datenschutz, z. B. in der Schule).
// Aufrufe älter als RETENTION_DAYS werden automatisch gelöscht.
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { ReadConfirmationService } from '../read-confirmation/read-confirmation.service';
import { hasPermission } from '../roles/role-store';

export const RETENTION_DAYS = 365;
/** Erneutes Öffnen innerhalb dieser Zeit zählt nicht als neuer Aufruf. */
const DEDUPE_MS = 30 * 60 * 1000;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

const PERIODS = [7, 30, 90, 365];

@Injectable()
export class PageStatsService {
  private readonly logger = new Logger(PageStatsService.name);
  private readonly recent = new Map<string, number>();
  private lastPurge = 0;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly readConfirmationService: ReadConfirmationService,
  ) {}

  private async loadPage(pageId: string, user: User): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== user.workspaceId) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  private async canEdit(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user);
      return true;
    } catch {
      return false;
    }
  }

  canSeeNames(user: User) {
    return hasPermission(user, 'page_stats');
  }

  // ---------------------------------------------------------------- Aufrufe

  async recordView(pageId: string, user: User) {
    const key = `${user.id}:${pageId}`;
    const now = Date.now();
    const last = this.recent.get(key);
    if (last && now - last < DEDUPE_MS) return { recorded: false };

    const page = await this.loadPage(pageId, user);
    this.recent.set(key, now);
    if (this.recent.size > 20_000) {
      for (const [k, t] of this.recent) if (now - t > DEDUPE_MS) this.recent.delete(k);
    }

    await this.db
      .insertInto('lt4PageViews')
      .values({
        pageId: page.id,
        userId: user.id,
        workspaceId: page.workspaceId,
        day: sql`current_date`,
        views: 1,
        lastViewedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['pageId', 'userId', 'day']).doUpdateSet({
          views: sql`lt4_page_views.views + 1`,
          lastViewedAt: new Date(),
        }),
      )
      .execute();

    void this.purgeOld();
    return { recorded: true };
  }

  private async purgeOld() {
    const now = Date.now();
    if (now - this.lastPurge < PURGE_EVERY_MS) return;
    this.lastPurge = now;
    try {
      await this.db
        .deleteFrom('lt4PageViews')
        .where('day', '<', sql<any>`current_date - ${RETENTION_DAYS}::int`)
        .execute();
    } catch (err) {
      this.logger.warn(`Alte Aufrufe konnten nicht gelöscht werden: ${err}`);
    }
  }

  // ------------------------------------------------------- Statistik je Seite

  async pageStats(pageId: string, days: number | undefined, user: User) {
    const page = await this.loadPage(pageId, user);
    const canSeeNames = this.canSeeNames(user);
    if (!canSeeNames && !(await this.canEdit(page, user))) {
      throw new ForbiddenException();
    }
    const period = PERIODS.includes(days ?? 0) ? days! : 30;
    const since = sql<any>`current_date - ${period - 1}::int`;

    const series = await this.db
      .selectFrom('lt4PageViews')
      .select([
        sql<string>`to_char(day, 'YYYY-MM-DD')`.as('day'),
        sql<number>`sum(views)::int`.as('views'),
        sql<number>`count(distinct user_id)::int`.as('viewers'),
      ])
      .where('pageId', '=', page.id)
      .where('day', '>=', since)
      .groupBy('day')
      .orderBy('day')
      .execute();

    const totals = await this.db
      .selectFrom('lt4PageViews')
      .select([
        sql<number>`coalesce(sum(views), 0)::int`.as('views'),
        sql<number>`count(distinct user_id)::int`.as('viewers'),
        sql<Date | null>`max(last_viewed_at)`.as('lastViewedAt'),
      ])
      .where('pageId', '=', page.id)
      .where('day', '>=', since)
      .executeTakeFirst();

    const allTime = await this.db
      .selectFrom('lt4PageViews')
      .select([
        sql<number>`coalesce(sum(views), 0)::int`.as('views'),
        sql<number>`count(distinct user_id)::int`.as('viewers'),
        sql<Date | null>`max(last_viewed_at)`.as('lastViewedAt'),
        sql<string | null>`to_char(min(day), 'YYYY-MM-DD')`.as('since'),
      ])
      .where('pageId', '=', page.id)
      .executeTakeFirst();

    const lastEditor = page.lastUpdatedById
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name', 'avatarUrl'])
          .where('id', '=', page.lastUpdatedById)
          .executeTakeFirst()
      : null;

    let readers: Array<{
      user: { id: string; name: string | null; avatarUrl: string | null };
      views: number;
      lastViewedAt: Date;
    }> | null = null;
    let notOpened: Array<{ id: string; name: string | null; avatarUrl: string | null }> | null =
      null;
    let audienceSize: number | null = null;

    if (canSeeNames) {
      const rows = await this.db
        .selectFrom('lt4PageViews as v')
        .innerJoin('users as u', 'u.id', 'v.userId')
        .select([
          'u.id',
          'u.name',
          'u.avatarUrl',
          sql<number>`sum(v.views)::int`.as('views'),
          sql<Date>`max(v.last_viewed_at)`.as('lastViewedAt'),
        ])
        .where('v.pageId', '=', page.id)
        .where('v.day', '>=', since)
        .groupBy(['u.id', 'u.name', 'u.avatarUrl'])
        .orderBy(sql`max(v.last_viewed_at)`, 'desc')
        .limit(1000)
        .execute();
      readers = rows.map((r) => ({
        user: { id: r.id, name: r.name, avatarUrl: r.avatarUrl },
        views: r.views,
        lastViewedAt: r.lastViewedAt,
      }));

      // Wer Zugriff hat, die Seite aber im Zeitraum nicht geöffnet hat
      const audience = await this.readConfirmationService.audience(page);
      audienceSize = audience.length;
      const seen = new Set(rows.map((r) => r.id));
      notOpened = audience.filter((u) => !seen.has(u.id));
    }

    return {
      pageId: page.id,
      days: period,
      retentionDays: RETENTION_DAYS,
      canSeeNames,
      views: totals?.views ?? 0,
      viewers: totals?.viewers ?? 0,
      lastViewedAt: totals?.lastViewedAt ?? null,
      allTime: {
        views: allTime?.views ?? 0,
        viewers: allTime?.viewers ?? 0,
        lastViewedAt: allTime?.lastViewedAt ?? null,
        since: allTime?.since ?? null,
      },
      series,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      lastUpdatedBy: lastEditor ?? null,
      audienceSize,
      readers,
      notOpened,
    };
  }

  // --------------------------------------------------------- Veraltete Seiten

  async stalePages(
    opts: { days?: number; spaceId?: string | null; mine?: boolean },
    user: User,
  ) {
    const days = Math.min(Math.max(Math.round(opts.days ?? 180), 1), 3650);
    let spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id, {
      excludeArchived: true,
    });
    if (opts.spaceId) spaceIds = spaceIds.filter((id) => id === opts.spaceId);
    if (spaceIds.length === 0) return { days, items: [] };

    const cutoff = new Date(Date.now() - days * 86400_000);

    let q = this.db
      .selectFrom('pages')
      .innerJoin('spaces as s', 's.id', 'pages.spaceId')
      .leftJoin('users as u', 'u.id', 'pages.lastUpdatedById')
      .select([
        'pages.id',
        'pages.slugId',
        'pages.title',
        'pages.icon',
        'pages.isBase',
        'pages.updatedAt',
        'pages.createdAt',
        'pages.spaceId',
        's.name as spaceName',
        's.slug as spaceSlug',
        'u.id as lastUpdatedById',
        'u.name as lastUpdatedByName',
        'u.avatarUrl as lastUpdatedByAvatarUrl',
        (eb) =>
          eb
            .selectFrom('lt4PageViews as v')
            .select(sql<number>`coalesce(sum(v.views), 0)::int`.as('views'))
            .whereRef('v.pageId', '=', 'pages.id')
            .where('v.day', '>=', sql<any>`current_date - 89`)
            .as('views90'),
        (eb) =>
          eb
            .selectFrom('lt4PageViews as v')
            .select(sql<Date | null>`max(v.last_viewed_at)`.as('lastViewedAt'))
            .whereRef('v.pageId', '=', 'pages.id')
            .as('lastViewedAt'),
      ])
      .where('pages.workspaceId', '=', user.workspaceId)
      .where('pages.spaceId', 'in', spaceIds)
      .where('pages.deletedAt', 'is', null)
      .where('s.deletedAt', 'is', null)
      .where('pages.updatedAt', '<', cutoff)
      .where(this.pagePermissionRepo.canUserAccessPageExpression(user.id));

    if (opts.mine) {
      q = q.where((eb) =>
        eb.or([
          eb('pages.creatorId', '=', user.id),
          eb('pages.lastUpdatedById', '=', user.id),
        ]),
      );
    }

    const rows = await q.orderBy('pages.updatedAt', 'asc').limit(500).execute();
    return {
      days,
      items: rows.map((r) => ({
        ...r,
        views90: Number(r.views90 ?? 0),
      })),
    };
  }
}
