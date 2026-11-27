// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > SCIM: einschalten und Tokens verwalten (Rollenrecht "scim").
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { ScimTokenService } from './scim-token.service';

class ScimEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

class CreateScimTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

class ScimTokenIdDto {
  @IsUUID()
  tokenId: string;
}

class ScimTokenEnabledDto extends ScimTokenIdDto {
  @IsBoolean()
  enabled: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('lt4/scim')
export class ScimSettingsController {
  constructor(private readonly tokens: ScimTokenService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  overview(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.tokens.overview(user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('enabled')
  setEnabled(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: ScimEnabledDto) {
    return this.tokens.setEnabled(user, workspace, dto.enabled);
  }

  @HttpCode(HttpStatus.OK)
  @Post('tokens/create')
  create(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: CreateScimTokenDto) {
    return this.tokens.create(user, workspace, dto.name);
  }

  @HttpCode(HttpStatus.OK)
  @Post('tokens/enabled')
  async setTokenEnabled(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: ScimTokenEnabledDto) {
    await this.tokens.setTokenEnabled(user, workspace, dto.tokenId, dto.enabled);
    return { ok: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('tokens/delete')
  async remove(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: ScimTokenIdDto) {
    await this.tokens.remove(user, workspace, dto.tokenId);
    return { ok: true };
  }
}
