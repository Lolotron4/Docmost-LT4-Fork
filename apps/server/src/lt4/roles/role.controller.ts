// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { RoleService } from './role.service';
import { CreateRoleDto, DeleteRoleDto, MoveRoleDto, SetGroupRoleDto, UpdateRoleDto } from './role.dto';

@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  /** Alle Rollen mit Rangfolge. Für alle Mitglieder lesbar (Namen in Listen). */
  @HttpCode(HttpStatus.OK)
  @Post()
  list(@AuthUser() user: User) {
    return this.roles.list(user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(@AuthUser() user: User, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(@AuthUser() user: User, @Body() dto: UpdateRoleDto) {
    return this.roles.update(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('move')
  move(@AuthUser() user: User, @Body() dto: MoveRoleDto) {
    return this.roles.move(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  delete(@AuthUser() user: User, @Body() dto: DeleteRoleDto) {
    return this.roles.delete(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('group-role')
  setGroupRole(@AuthUser() user: User, @Body() dto: SetGroupRoleDto) {
    return this.roles.setGroupRole(user, dto);
  }
}
