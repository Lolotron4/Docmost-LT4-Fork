// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { TaskService } from './task.service';
import { localDay } from './task-reminder.service';

class ListDto {
  @IsOptional()
  @IsIn(['mine', 'assigned'])
  mode?: 'mine' | 'assigned';

  @IsOptional()
  @IsIn(['open', 'done'])
  status?: 'open' | 'done';
}

class SetCheckedDto {
  @IsUUID()
  id: string;

  @IsBoolean()
  checked: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @HttpCode(HttpStatus.OK)
  @Post('list')
  list(@Body() dto: ListDto, @AuthUser() user: User) {
    return this.service.list(user, dto.mode ?? 'mine', dto.status ?? 'open');
  }

  @HttpCode(HttpStatus.OK)
  @Post('counts')
  counts(@AuthUser() user: User) {
    return this.service.counts(user, localDay(new Date(), user.timezone).day);
  }

  @HttpCode(HttpStatus.OK)
  @Post('set-checked')
  setChecked(@Body() dto: SetCheckedDto, @AuthUser() user: User) {
    return this.service.setChecked(dto.id, dto.checked, user);
  }
}
