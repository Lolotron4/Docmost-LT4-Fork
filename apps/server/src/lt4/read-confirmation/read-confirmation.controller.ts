// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { ReadConfirmationService } from './read-confirmation.service';

class PageIdDto {
  @IsUUID()
  pageId: string;
}

class RequestDto extends PageIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('read-confirmations')
export class ReadConfirmationController {
  constructor(private readonly service: ReadConfirmationService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.info(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('request')
  request(@Body() dto: RequestDto, @AuthUser() user: User) {
    return this.service.request(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('ask-again')
  askAgain(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.askAgain(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remind')
  remind(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.remind(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  remove(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.remove(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  confirm(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.confirm(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.service.status(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('pending')
  pending(@AuthUser() user: User) {
    return this.service.pending(user);
  }
}
