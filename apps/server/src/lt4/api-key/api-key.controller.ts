// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { ApiKeyService } from './api-key.service';
import { ApiKeyIdDto, CreateApiKeyDto, ListApiKeysDto, UpdateApiKeyDto } from './api-key.dto';

/** Schlüssel verwalten geht nur in einer echten Anmeldung, nicht mit einem API-Schlüssel. */
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: ListApiKeysDto) {
    return this.apiKeys.list(user, workspace, dto.all === true);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: UpdateApiKeyDto) {
    return this.apiKeys.rename(user, workspace, dto.apiKeyId, dto.name);
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: ApiKeyIdDto) {
    await this.apiKeys.revoke(user, workspace, dto.apiKeyId);
    return { ok: true };
  }
}
