// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { BaseService } from './base.service';
import {
  BasePageDto,
  ConvertToBaseDto,
  CreateBaseDto,
  CreatePropertyDto,
  CreateRowDto,
  CreateViewDto,
  DeleteRowsDto,
  MovePropertyDto,
  MoveRowDto,
  PropertyIdDto,
  UpdatePropertyDto,
  UpdateRowDto,
  UpdateViewDto,
  ViewIdDto,
} from './base.dto';

@UseGuards(JwtAuthGuard)
@Controller('bases')
export class BaseController {
  constructor(private readonly bases: BaseService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: CreateBaseDto) {
    return this.bases.create(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('convert')
  convert(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: ConvertToBaseDto) {
    return this.bases.convert(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: BasePageDto) {
    return this.bases.info(user, ws.id, dto.pageId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows')
  rows(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: BasePageDto) {
    return this.bases.rows(user, ws.id, dto.pageId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/create')
  createProperty(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: CreatePropertyDto) {
    return this.bases.createProperty(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/update')
  updateProperty(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: UpdatePropertyDto) {
    return this.bases.updateProperty(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/delete')
  deleteProperty(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: PropertyIdDto) {
    return this.bases.deleteProperty(user, ws.id, dto.pageId, dto.propertyId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/move')
  moveProperty(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: MovePropertyDto) {
    return this.bases.moveProperty(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/create')
  createRow(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: CreateRowDto) {
    return this.bases.createRow(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/update')
  updateRow(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: UpdateRowDto) {
    return this.bases.updateRow(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete')
  deleteRows(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: DeleteRowsDto) {
    return this.bases.deleteRows(user, ws.id, dto.pageId, dto.rowIds);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/move')
  moveRow(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: MoveRowDto) {
    return this.bases.moveRow(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  createView(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: CreateViewDto) {
    return this.bases.createView(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/update')
  updateView(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: UpdateViewDto) {
    return this.bases.updateView(user, ws.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/delete')
  deleteView(@AuthUser() user: User, @AuthWorkspace() ws: Workspace, @Body() dto: ViewIdDto) {
    return this.bases.deleteView(user, ws.id, dto.pageId, dto.viewId);
  }
}
