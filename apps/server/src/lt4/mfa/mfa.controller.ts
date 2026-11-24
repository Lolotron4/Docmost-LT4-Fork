// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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
import { MfaService } from './mfa.service';
import { MfaCodeDto, MfaResetUserDto } from './mfa.dto';

@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  // --- Login-Schritt (nur mit MFA-Cookie aus /auth/login) ---

  @HttpCode(HttpStatus.OK)
  @Post('login/info')
  loginInfo(@Req() req: FastifyRequest, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.getLoginInfo(req, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login/verify')
  async loginVerify(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaCodeDto,
  ) {
    await this.mfaService.loginVerify(req, res, workspace, dto.code);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login/setup')
  loginSetup(@Req() req: FastifyRequest, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.loginSetup(req, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login/enable')
  loginEnable(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaCodeDto,
  ) {
    return this.mfaService.loginEnable(req, res, workspace, dto.code);
  }

  // --- Kontoeinstellungen (angemeldet) ---

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.getStatus(user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  setup(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.setup(user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  async enable(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaCodeDto,
  ) {
    const backupCodes = await this.mfaService.enable(user, workspace, dto.code);
    return { backupCodes };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('disable')
  disable(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaCodeDto,
  ) {
    return this.mfaService.disable(user, workspace, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('backup-codes')
  backupCodes(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaCodeDto,
  ) {
    return this.mfaService.regenerateBackupCodes(user, workspace, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('reset-user')
  resetUser(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: MfaResetUserDto,
  ) {
    return this.mfaService.resetForUser(user, workspace, dto.userId);
  }
}
