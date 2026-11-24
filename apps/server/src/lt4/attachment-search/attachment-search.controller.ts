// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Suche in Dateinamen und im Text von Anhängen. Treffer nur aus Bereichen und
// Seiten, die die Person sehen darf.
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { SearchDTO } from '../../core/search/dto/search.dto';

const tsQueryOf = (query: string) =>
  query
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(' & ');

@UseGuards(JwtAuthGuard)
@Controller('search-attachments')
export class AttachmentSearchController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async search(
    @Body() dto: SearchDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const query = (dto.query ?? '').trim().slice(0, 200);
    const tsq = tsQueryOf(query);
    if (!query || !tsq) return { items: [] };

    if (dto.spaceId) {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const like = `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const tsquery = sql`to_tsquery('english', f_unaccent(${tsq}))`;

    let qb = this.db
      .selectFrom('attachments as a')
      .innerJoin('pages as p', 'p.id', 'a.pageId')
      .innerJoin('spaces as s', 's.id', 'a.spaceId')
      .select([
        'a.id',
        'a.fileName',
        'a.pageId',
        'a.creatorId',
        'a.createdAt',
        'a.updatedAt',
        's.id as spaceId',
        's.name as spaceName',
        's.slug as spaceSlug',
        's.logo as spaceIcon',
        's.archivedAt as spaceArchivedAt',
        'p.title as pageTitle',
        'p.slugId as pageSlugId',
        sql<number>`coalesce(ts_rank(a.tsv, ${tsquery}), 0) + case when lower(a.file_name) like ${like} then 1 else 0 end`.as(
          'rank',
        ),
        sql<string>`case when a.tsv @@ ${tsquery} then ts_headline('english', substring(a.text_content, 1, 100000), ${tsquery}, 'MinWords=9, MaxWords=12, MaxFragments=2') else '' end`.as(
          'highlight',
        ),
      ])
      .where('a.workspaceId', '=', workspace.id)
      .where('a.deletedAt', 'is', null)
      .where('p.deletedAt', 'is', null)
      .where('a.type', '=', 'file')
      .where((eb) =>
        eb.or([
          eb(sql`a.tsv`, '@@', tsquery),
          eb(sql`lower(a.file_name)`, 'like', like),
        ]),
      )
      .orderBy('rank', 'desc')
      .limit(Math.min(Number(dto.limit) || 25, 50))
      .offset(Number(dto.offset) || 0);

    if (dto.spaceId) {
      qb = qb.where('a.spaceId', '=', dto.spaceId);
    } else {
      qb = qb.where(
        'a.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(user.id, {
          excludeArchived: !dto.includeArchived,
        }),
      );
    }

    const rows = await qb.execute();
    if (rows.length === 0) return { items: [] };

    // Seitenrechte beachten (gesperrte Seiten bleiben unsichtbar)
    const allowed = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(rows.map((r) => r.pageId))],
        userId: user.id,
        spaceId: dto.spaceId,
      }),
    );

    return {
      items: rows
        .filter((r) => allowed.has(r.pageId))
        .map((r) => ({
          id: r.id,
          fileName: r.fileName,
          pageId: r.pageId,
          creatorId: r.creatorId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          rank: String(r.rank),
          highlight: (r.highlight ?? '').replace(/\s+/g, ' ').trim(),
          space: {
            id: r.spaceId,
            name: r.spaceName,
            slug: r.spaceSlug,
            icon: r.spaceIcon,
            archivedAt: r.spaceArchivedAt,
          },
          page: { id: r.pageId, title: r.pageTitle, slugId: r.pageSlugId },
        })),
    };
  }
}
