// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { TemplateService } from './template.service';
import {
  CreatePageFromTemplateDto,
  CreateTemplateDto,
  ListTemplatesDto,
  TemplateIdDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './template.dto';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplateController {
  constructor(private readonly templates: TemplateService) {}

  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  permissions(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.templates.permissions(user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  list(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: ListTemplatesDto,
  ) {
    return this.templates.list(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: TemplateIdDto) {
    return this.templates.info(user, workspace, dto.templateId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.create(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: TemplateIdDto,
  ) {
    await this.templates.remove(user, workspace, dto.templateId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('use')
  use(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: UseTemplateDto) {
    return this.templates.use(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-page')
  createPage(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreatePageFromTemplateDto,
  ) {
    return this.templates.createPage(user, workspace, dto);
  }
}
