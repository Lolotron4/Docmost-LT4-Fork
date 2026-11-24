// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Verwaltung von Seitenrechten. Die Prüfung, wer eine eingeschränkte Seite sehen
// oder bearbeiten darf, steckt bereits im AGPL-Kern (PagePermissionRepo,
// PageAccessService). Dieser Service ergänzt nur das Setzen und Ändern.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
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
import {
  AddPagePermissionsDto,
  PagePermissionTargetDto,
  UpdatePagePermissionRoleDto,
} from './page-permission.dto';

export interface PagePermissionInfo {
  pageId: string;
  /** Die Seite selbst ist eingeschränkt. */
  isRestricted: boolean;
  /** Nächste eingeschränkte Vorfahren-Seite, falls Rechte geerbt werden. */
  inheritedFrom: { id: string; slugId: string; title: string | null } | null;
  /** Der aktuelle Nutzer darf die Rechte dieser Seite verwalten. */
  canManage: boolean;
}

@Injectable()
export class PagePermissionService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getInfo(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<PagePermissionInfo> {
    const page = await this.loadPage(pageId, workspaceId);
    await this.assertCanView(page, user);

    const nearest = await this.pagePermissionRepo.findRestrictedAncestor(
      page.id,
    );
    const isRestricted = nearest?.depth === 0;

    let inheritedFrom: PagePermissionInfo['inheritedFrom'] = null;
    const inheritedAccess = isRestricted
      ? await this.findRestrictedAncestorAbove(page)
      : nearest;
    if (inheritedAccess) {
      const ancestor = await this.pageRepo.findById(inheritedAccess.pageId);
      if (ancestor) {
        inheritedFrom = {
          id: ancestor.id,
          slugId: ancestor.slugId,
          title: ancestor.title,
        };
      }
    }

    return {
      pageId: page.id,
      isRestricted,
      inheritedFrom,
      canManage: await this.canManage(page, user),
    };
  }

  async listMembers(
    pageId: string,
    pagination: PaginationOptions,
    user: User,
    workspaceId: string,
  ) {
    const page = await this.loadPage(pageId, workspaceId);
    await this.assertCanView(page, user);

    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!access) {
      return {
        items: [],
        meta: {
          limit: pagination.limit,
          hasNextPage: false,
          hasPrevPage: false,
          nextCursor: null,
          prevCursor: null,
        },
      };
    }
    return this.pagePermissionRepo.getPagePermissionsPaginated(
      access.id,
      pagination,
    );
  }

  /**
   * Schränkt die Seite ein. Startpunkt ist das bisherige Publikum: Erbt die
   * Seite schon eine Einschränkung, wird diese kopiert, damit niemand
   * überraschend den Zugriff verliert. Der Nutzer selbst wird Bearbeiter.
   */
  async restrict(pageId: string, user: User, workspaceId: string) {
    const page = await this.loadPage(pageId, workspaceId);
    await this.assertCanManage(page, user);

    await executeTx(this.db, async (trx) => {
      const existing = await this.pagePermissionRepo.findPageAccessByPageId(
        page.id,
        trx,
      );
      if (existing) return;

      await this.pagePermissionRepo.copyInheritedRestriction([page.id], trx);

      let access = await this.pagePermissionRepo.findPageAccessByPageId(
        page.id,
        trx,
      );
      if (!access) {
        access = await this.pagePermissionRepo.insertPageAccess(
          {
            pageId: page.id,
            workspaceId: page.workspaceId,
            spaceId: page.spaceId,
            accessLevel: PageAccessLevel.RESTRICTED,
            creatorId: user.id,
          },
          trx,
        );
      }

      await this.ensureUserIsWriter(access.id, user.id, trx);
    });

    await this.invalidate(page, [user.id]);
    return this.getInfo(page.id, user, workspaceId);
  }

  async unrestrict(pageId: string, user: User, workspaceId: string) {
    const page = await this.loadPage(pageId, workspaceId);
    await this.assertCanManage(page, user);

    await this.pagePermissionRepo.deletePageAccess(page.id);
    await this.invalidate(page);
    return this.getInfo(page.id, user, workspaceId);
  }

  async addMembers(dto: AddPagePermissionsDto, user: User, workspaceId: string) {
    const userIds = [...new Set(dto.userIds ?? [])];
    const groupIds = [...new Set(dto.groupIds ?? [])];
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException('Select at least one user or group');
    }

    const page = await this.loadPage(dto.pageId, workspaceId);
    await this.assertCanManage(page, user);
    const access = await this.requireAccess(page);
    await this.assertBelongToWorkspace(userIds, groupIds, workspaceId);

    await executeTx(this.db, async (trx) => {
      for (const userId of userIds) {
        const existing = await this.pagePermissionRepo.findPagePermissionByUserId(
          access.id,
          userId,
          trx,
        );
        if (existing) {
          await this.pagePermissionRepo.updatePagePermissionRole(
            access.id,
            dto.role,
            { userId },
            trx,
          );
        } else {
          await this.pagePermissionRepo.insertPagePermissions(
            [{ pageAccessId: access.id, userId, role: dto.role, addedById: user.id }],
            trx,
          );
        }
      }
      for (const groupId of groupIds) {
        const existing =
          await this.pagePermissionRepo.findPagePermissionByGroupId(
            access.id,
            groupId,
            trx,
          );
        if (existing) {
          await this.pagePermissionRepo.updatePagePermissionRole(
            access.id,
            dto.role,
            { groupId },
            trx,
          );
        } else {
          await this.pagePermissionRepo.insertPagePermissions(
            [{ pageAccessId: access.id, groupId, role: dto.role, addedById: user.id }],
            trx,
          );
        }
      }
    });

    await this.invalidate(page, userIds);
  }

  async removeMember(
    dto: PagePermissionTargetDto,
    user: User,
    workspaceId: string,
  ) {
    this.assertSingleTarget(dto);
    const page = await this.loadPage(dto.pageId, workspaceId);
    await this.assertCanManage(page, user);
    const access = await this.requireAccess(page);

    await executeTx(this.db, async (trx) => {
      const target = await this.findTarget(access.id, dto, trx);
      if (target.role === PagePermissionRole.WRITER) {
        await this.assertNotLastWriter(access.id, trx);
      }
      if (dto.userId) {
        await this.pagePermissionRepo.deletePagePermissionByUserId(
          access.id,
          dto.userId,
          trx,
        );
      } else {
        await this.pagePermissionRepo.deletePagePermissionByGroupId(
          access.id,
          dto.groupId,
          trx,
        );
      }
    });

    await this.invalidate(page, dto.userId ? [dto.userId] : []);
  }

  async updateRole(
    dto: UpdatePagePermissionRoleDto,
    user: User,
    workspaceId: string,
  ) {
    this.assertSingleTarget(dto);
    const page = await this.loadPage(dto.pageId, workspaceId);
    await this.assertCanManage(page, user);
    const access = await this.requireAccess(page);

    await executeTx(this.db, async (trx) => {
      const target = await this.findTarget(access.id, dto, trx);
      if (target.role === dto.role) return;
      if (target.role === PagePermissionRole.WRITER) {
        await this.assertNotLastWriter(access.id, trx);
      }
      await this.pagePermissionRepo.updatePagePermissionRole(
        access.id,
        dto.role,
        dto.userId ? { userId: dto.userId } : { groupId: dto.groupId },
        trx,
      );
    });

    await this.invalidate(page, dto.userId ? [dto.userId] : []);
  }

  // --- Hilfsfunktionen ---

  private async loadPage(pageId: string, workspaceId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspaceId || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async isSpaceAdmin(page: Page, user: User): Promise<boolean> {
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  }

  /** Space-Admins sehen die Rechte immer, damit sie Aussperrungen lösen können. */
  private async assertCanView(page: Page, user: User): Promise<void> {
    if (await this.isSpaceAdmin(page, user)) return;

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    const canAccess = await this.pagePermissionRepo.canUserAccessPage(
      user.id,
      page.id,
      { skipCache: true },
    );
    if (!canAccess) throw new ForbiddenException();
  }

  /**
   * Verwalten dürfen Space-Admins und alle, die die Seite bearbeiten dürfen:
   * bei eingeschränkten Seiten Bearbeiter der Seite, sonst Space-Bearbeiter.
   */
  private async canManage(page: Page, user: User): Promise<boolean> {
    if (await this.isSpaceAdmin(page, user)) return true;

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      return false;
    }
    const { hasAnyRestriction, canEdit } =
      await this.pagePermissionRepo.canUserEditPage(user.id, page.id, {
        skipCache: true,
      });
    return hasAnyRestriction
      ? canEdit
      : ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  }

  private async assertCanManage(page: Page, user: User): Promise<void> {
    if (!(await this.canManage(page, user))) {
      throw new ForbiddenException();
    }
  }

  private async requireAccess(page: Page) {
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!access) {
      throw new BadRequestException('Page is not restricted');
    }
    return access;
  }

  private async findRestrictedAncestorAbove(page: Page) {
    if (!page.parentPageId) return undefined;
    return this.pagePermissionRepo.findRestrictedAncestor(page.parentPageId);
  }

  private assertSingleTarget(dto: PagePermissionTargetDto): void {
    if (Boolean(dto.userId) === Boolean(dto.groupId)) {
      throw new BadRequestException('Provide either userId or groupId');
    }
  }

  private async findTarget(
    pageAccessId: string,
    dto: PagePermissionTargetDto,
    trx: KyselyTransaction,
  ) {
    const target = dto.userId
      ? await this.pagePermissionRepo.findPagePermissionByUserId(
          pageAccessId,
          dto.userId,
          trx,
        )
      : await this.pagePermissionRepo.findPagePermissionByGroupId(
          pageAccessId,
          dto.groupId,
          trx,
        );
    if (!target) {
      throw new NotFoundException('Permission not found');
    }
    return target;
  }

  private async assertNotLastWriter(
    pageAccessId: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    const writers = await this.pagePermissionRepo.countWritersByPageAccessId(
      pageAccessId,
      { trx },
    );
    if (writers <= 1) {
      throw new BadRequestException(
        'A restricted page needs at least one member who can edit',
      );
    }
  }

  private async ensureUserIsWriter(
    pageAccessId: string,
    userId: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    const existing = await this.pagePermissionRepo.findPagePermissionByUserId(
      pageAccessId,
      userId,
      trx,
    );
    if (!existing) {
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId,
            userId,
            role: PagePermissionRole.WRITER,
            addedById: userId,
          },
        ],
        trx,
      );
    } else if (existing.role !== PagePermissionRole.WRITER) {
      await this.pagePermissionRepo.updatePagePermissionRole(
        pageAccessId,
        PagePermissionRole.WRITER,
        { userId },
        trx,
      );
    }
  }

  private async assertBelongToWorkspace(
    userIds: string[],
    groupIds: string[],
    workspaceId: string,
  ): Promise<void> {
    if (userIds.length > 0) {
      const users = await this.db
        .selectFrom('users')
        .select('id')
        .where('id', 'in', userIds)
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .execute();
      if (users.length !== userIds.length) {
        throw new BadRequestException('Unknown user');
      }
    }
    if (groupIds.length > 0) {
      const groups = await this.db
        .selectFrom('groups')
        .select('id')
        .where('id', 'in', groupIds)
        .where('workspaceId', '=', workspaceId)
        .execute();
      if (groups.length !== groupIds.length) {
        throw new BadRequestException('Unknown group');
      }
    }
  }

  /** Rechte-Caches sofort leeren, statt auf das 5-Sekunden-TTL zu warten. */
  private async invalidate(page: Page, userIds: string[] = []): Promise<void> {
    const keys = [
      `${WS_SPACE_RESTRICTION_CACHE_PREFIX}${page.spaceId}`,
      ...userIds.map((userId) => CacheKey.PAGE_CAN_EDIT(userId, page.id)),
    ];
    await Promise.all(
      keys.map((key) => this.cacheManager.del(key).catch(() => undefined)),
    );
  }
}
