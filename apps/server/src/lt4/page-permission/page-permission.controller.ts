// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PagePermissionService } from './page-permission.service';
import {
  AddPagePermissionsDto,
  PagePermissionPageDto,
  PagePermissionTargetDto,
  UpdatePagePermissionRoleDto,
} from './page-permission.dto';

@UseGuards(JwtAuthGuard)
@Controller('page-permissions')
export class PagePermissionController {
  constructor(private readonly pagePermissionService: PagePermissionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.getInfo(dto.pageId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  members(
    @Body() dto: PagePermissionPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.listMembers(
      dto.pageId,
      pagination,
      user,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  restrict(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.restrict(dto.pageId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unrestrict')
  unrestrict(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.unrestrict(
      dto.pageId,
      user,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('add')
  add(
    @Body() dto: AddPagePermissionsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.addMembers(dto, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  remove(
    @Body() dto: PagePermissionTargetDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.removeMember(dto, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('role')
  role(
    @Body() dto: UpdatePagePermissionRoleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePermissionService.updateRole(dto, user, workspace.id);
  }
}
