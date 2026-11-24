// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SsoProviderService } from './sso-provider.service';
import { SsoAuthService } from './sso-auth.service';
import {
  CreateSsoProviderDto,
  SsoProviderIdDto,
  UpdateSsoProviderDto,
} from './sso.dto';

@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('sso')
export class SsoController {
  constructor(
    private readonly providers: SsoProviderService,
    private readonly ssoAuth: SsoAuthService,
  ) {}

  // --- Anmeldung (Browser-Weiterleitungen) ---

  @Get(':id/login')
  async login(
    @AuthWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('mode') mode: string,
    @Query('redirect') redirect: string,
    @Query('code') joinCode: string,
    @Res() res: FastifyReply,
  ) {
    try {
      const url = await this.ssoAuth.start(
        workspace,
        id,
        {
          mode: mode === 'join' || mode === 'link' ? mode : 'login',
          redirect,
          joinCode: typeof joinCode === 'string' ? joinCode.slice(0, 64) : undefined,
        },
        res,
      );
      return res.redirect(url, 302);
    } catch {
      return res.redirect(
        `/login?ssoError=${encodeURIComponent('Sign-in with this provider failed.')}`,
        302,
      );
    }
  }

  @Get(':id/callback')
  async callback(
    @AuthWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const target = await this.ssoAuth.callback(workspace, id, req, res);
    return res.redirect(target, 302);
  }

  // --- Eigene verknüpfte Konten ---

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('accounts')
  accounts(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.ssoAuth.listLinkedAccounts(user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('accounts/unlink')
  unlink(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: SsoProviderIdDto,
  ) {
    return this.ssoAuth.unlink(user, workspace, dto.id);
  }

  // --- Verwaltung (Admins) ---

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.providers.list(user, workspace);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/create')
  create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateSsoProviderDto,
  ) {
    return this.providers.create(user, workspace, dto);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/update')
  update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateSsoProviderDto,
  ) {
    return this.providers.update(user, workspace, dto);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/delete')
  remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: SsoProviderIdDto,
  ) {
    return this.providers.remove(user, workspace, dto.id);
  }
}
