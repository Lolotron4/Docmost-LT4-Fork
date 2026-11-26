// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { hasPermission } from '../roles/role-store';
import { ShareGuardService } from './share-guard.service';
import {
  ShareGuardIdDto,
  ShareGuardUnlockDto,
  ShareGuardUpdateDto,
  ShareLinkPolicyDto,
} from './share-guard.dto';

@UseGuards(JwtAuthGuard)
@Controller('lt4-shares')
export class ShareGuardController {
  constructor(
    private readonly shareGuard: ShareGuardService,
    private readonly shareRepo: ShareRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private async loadShare(shareId: string, workspaceId: string) {
    const share = await this.shareRepo.findById(shareId);
    if (!share || share.workspaceId !== workspaceId) {
      throw new NotFoundException('Share not found');
    }
    const page = await this.pageRepo.findById(share.pageId);
    if (!page) throw new NotFoundException('Page not found');
    return { share, page };
  }

  /** Ablauf und Passwortstatus einer Freigabe (für den Teilen-Dialog). */
  @HttpCode(HttpStatus.OK)
  @Post('settings')
  async settings(@Body() dto: ShareGuardIdDto, @AuthUser() user: User) {
    const { share, page } = await this.loadShare(dto.shareId, user.workspaceId);
    await this.pageAccessService.validateCanView(page, user);
    return this.shareGuard.getPublicSettings(share.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(@Body() dto: ShareGuardUpdateDto, @AuthUser() user: User) {
    const { share, page } = await this.loadShare(dto.shareId, user.workspaceId);
    await this.pageAccessService.validateCanEdit(page, user);
    const before = await this.shareGuard.getPublicSettings(share.id);
    const after = await this.shareGuard.update(user, share, {
      expiresAt: dto.expiresAt,
      password: dto.password,
    });
    this.auditService.log({
      event: AuditEvent.SHARE_UPDATED,
      resourceType: AuditResource.SHARE,
      resourceId: share.id,
      spaceId: share.spaceId,
      changes: {
        before: { expiresAt: before.expiresAt, hasPassword: before.hasPassword },
        after: { expiresAt: after.expiresAt, hasPassword: after.hasPassword },
      },
      metadata: { pageId: share.pageId },
    });
    return after;
  }

  /** Regeln für Gastlinks und ob die Person sie umgehen darf. */
  @HttpCode(HttpStatus.OK)
  @Post('policy')
  async policy(@AuthUser() user: User) {
    return {
      ...(await this.shareGuard.getPolicy(user.workspaceId)),
      canBypass: this.shareGuard.canBypassPolicy(user),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('policy/update')
  async updatePolicy(@Body() dto: ShareLinkPolicyDto, @AuthUser() user: User) {
    if (!hasPermission(user, 'settings')) throw new ForbiddenException();
    const before = await this.shareGuard.getPolicy(user.workspaceId);
    const policy = await this.shareGuard.savePolicy(user.workspaceId, dto);
    this.auditService.log({
      event: AuditEvent.WORKSPACE_UPDATED,
      resourceType: AuditResource.WORKSPACE,
      resourceId: user.workspaceId,
      changes: { before: { shareLinks: before }, after: { shareLinks: policy } },
    });
    return policy;
  }
}

/** Öffentlicher Teil: Passwort eingeben. Eigener Controller wegen Drosselung. */
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('lt4-shares')
export class ShareGuardPublicController {
  constructor(
    private readonly shareGuard: ShareGuardService,
    private readonly shareRepo: ShareRepo,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('unlock')
  async unlock(
    @Body() dto: ShareGuardUnlockDto,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const share = await this.shareRepo.findById(dto.shareId);
    if (!share || share.workspaceId !== workspace.id) {
      throw new NotFoundException('Share not found');
    }
    return this.shareGuard.unlock(share.id, dto.password, res);
  }
}
