// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { LdapService } from './ldap.service';
import {
  CreateLdapProviderDto,
  LdapLoginDto,
  LdapProviderIdDto,
  LdapTestDto,
  UpdateLdapProviderDto,
} from './ldap.dto';

@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('ldap')
export class LdapController {
  constructor(private readonly ldap: LdapService) {}

  /** Anmeldung mit Benutzername und Passwort aus dem Verzeichnis. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/login')
  login(
    @AuthWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LdapLoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.ldap.login(workspace, id, dto.username, dto.password, res);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.ldap.list(user, workspace);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/create')
  create(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: CreateLdapProviderDto) {
    return this.ldap.create(user, workspace, dto);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/update')
  update(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: UpdateLdapProviderDto) {
    return this.ldap.update(user, workspace, dto);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/delete')
  remove(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: LdapProviderIdDto) {
    return this.ldap.remove(user, workspace, dto.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers/test')
  test(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: LdapTestDto) {
    return this.ldap.test(user, workspace, dto.id, dto.username);
  }
}
