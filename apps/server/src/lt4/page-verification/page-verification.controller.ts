// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { PageVerificationService } from './page-verification.service';
import type { PeriodUnit, VerificationState, VerificationType } from './page-verification.service';

class PageIdDto {
  @IsUUID()
  pageId: string;
}

class CandidatesDto extends PageIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;
}

class SetupDto extends PageIdDto {
  @IsIn(['expiring', 'qms'])
  type: VerificationType;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  verifierIds: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  periodAmount?: number | null;

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  periodUnit?: PeriodUnit | null;
}

class RejectDto extends PageIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

class ListDto {
  @IsOptional()
  @IsIn(['mine', 'all'])
  filter?: 'mine' | 'all';

  @IsOptional()
  @IsString()
  state?: VerificationState;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('page-verification')
export class PageVerificationController {
  constructor(private readonly service: PageVerificationService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.getInfo(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('candidates')
  candidates(@Body() dto: CandidatesDto, @AuthUser() user: User) {
    return this.service.candidates(dto.pageId, dto.query, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('setup')
  setup(@Body() dto: SetupDto, @AuthUser() user: User) {
    return this.service.setup(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  remove(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.remove(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  verify(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.verify(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('request')
  request(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.requestApproval(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('withdraw')
  withdraw(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.withdraw(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('approve')
  approve(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.approve(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject')
  reject(@Body() dto: RejectDto, @AuthUser() user: User) {
    return this.service.reject(dto.pageId, dto.comment, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  list(@Body() dto: ListDto, @AuthUser() user: User) {
    return this.service.list(dto, user);
  }
}
