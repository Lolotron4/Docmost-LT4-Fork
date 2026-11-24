// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AnnouncementService } from './announcement.service';
import {
  AnnouncementIdDto,
  ArchiveAnnouncementDto,
  CreateAnnouncementDto,
  ListAnnouncementsDto,
  UpdateAnnouncementDto,
} from './announcement.dto';

@UseGuards(JwtAuthGuard)
@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcements: AnnouncementService) {}

  /** Für eingeloggte Nutzer: alle gerade aktiven Banner. */
  @HttpCode(HttpStatus.OK)
  @Post('current')
  current(@AuthWorkspace() workspace: Workspace) {
    return this.announcements.current(workspace.id, true);
  }

  /** Ohne Anmeldung (Login, öffentliche Seiten): nur Zielgruppe "Alle". */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('public')
  publicCurrent(@Req() req: any) {
    return this.announcements.current(req.raw?.workspaceId ?? null, false);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  list(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: ListAnnouncementsDto,
  ) {
    return this.announcements.list(user, workspace, dto.archived === true);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcements.update(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('archive')
  archive(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: ArchiveAnnouncementDto,
  ) {
    return this.announcements.archive(user, workspace, dto.announcementId, dto.archived);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: AnnouncementIdDto,
  ) {
    await this.announcements.remove(user, workspace, dto.announcementId);
    return { ok: true };
  }
}
