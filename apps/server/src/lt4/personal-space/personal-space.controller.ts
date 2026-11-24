// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PersonalSpaceService } from './personal-space.service';

class CreatePersonalSpaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('personal-space')
export class PersonalSpaceController {
  constructor(private readonly personalSpaces: PersonalSpaceService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async mine(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return { space: await this.personalSpaces.mine(user, workspace) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreatePersonalSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.personalSpaces.create(user, workspace, dto.name);
  }
}
