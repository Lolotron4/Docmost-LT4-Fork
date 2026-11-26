// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { JoinCodeService } from './join-code.service';
import {
  CreateJoinCodeDto,
  JoinCodeDto,
  JoinCodeIdDto,
  JoinRegisterDto,
  SetMemberPasswordDto,
  UpdateJoinCodeGroupsDto,
} from './accounts.dto';

@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('join-links')
export class JoinCodeController {
  constructor(
    private readonly joinCodeService: JoinCodeService,
    private readonly environmentService: EnvironmentService,
  ) {}

  // --- öffentlich (Registrierungsseite) ---

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthWorkspace() workspace: Workspace, @Body() dto: JoinCodeDto) {
    return this.joinCodeService.getInfo(workspace, dto.code);
  }

  @HttpCode(HttpStatus.OK)
  @Post('register')
  async register(
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() dto: JoinRegisterDto,
  ) {
    const result = await this.joinCodeService.register(workspace, dto);
    if (!result.requiresLogin) {
      res.setCookie('authToken', result.authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environmentService.getCookieExpiresIn(),
        secure: this.environmentService.isHttps(),
      });
    }
    return { requiresLogin: result.requiresLogin };
  }

  // --- Admins ---

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('list')
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.joinCodeService.list(user, workspace);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateJoinCodeDto,
  ) {
    return this.joinCodeService.create(user, workspace, dto);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('update-groups')
  updateGroups(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateJoinCodeGroupsDto,
  ) {
    return this.joinCodeService.updateGroups(user, workspace, dto);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  revoke(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: JoinCodeIdDto,
  ) {
    return this.joinCodeService.revoke(user, workspace, dto.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('set-member-password')
  setMemberPassword(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: SetMemberPasswordDto,
  ) {
    return this.joinCodeService.setMemberPassword(user, workspace, dto);
  }
}
