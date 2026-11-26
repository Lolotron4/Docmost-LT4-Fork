// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { PageStatsService } from './page-stats.service';

class PageIdDto {
  @IsUUID()
  pageId: string;
}

class PageStatsDto extends PageIdDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

class StaleDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  @IsOptional()
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsBoolean()
  mine?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('page-stats')
export class PageStatsController {
  constructor(private readonly service: PageStatsService) {}

  @HttpCode(HttpStatus.OK)
  @Post('view')
  view(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.recordView(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('page')
  page(@Body() dto: PageStatsDto, @AuthUser() user: User) {
    return this.service.pageStats(dto.pageId, dto.days, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('stale')
  stale(@Body() dto: StaleDto, @AuthUser() user: User) {
    return this.service.stalePages(dto, user);
  }
}
