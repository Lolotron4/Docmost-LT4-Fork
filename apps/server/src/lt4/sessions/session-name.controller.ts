// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';

export class RenameSessionDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;
}

/** Eigene Geräte (Sitzungen) umbenennen, z. B. "Laptop Schule". */
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionNameController {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @HttpCode(HttpStatus.OK)
  @Post('rename')
  async rename(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: RenameSessionDto,
  ) {
    const result = await this.db
      .updateTable('userSessions')
      .set({ deviceName: dto.name })
      .where('id', '=', dto.sessionId)
      .where('userId', '=', user.id)
      .where('workspaceId', '=', workspace.id)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows ?? 0) === 0) {
      throw new NotFoundException('Session not found');
    }
    return { deviceName: dto.name };
  }
}
