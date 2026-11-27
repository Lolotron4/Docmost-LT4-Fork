// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto, UpdateWebhookDto, WebhookIdDto } from './webhook.dto';

@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.webhooks.list(user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.update(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  remove(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: WebhookIdDto) {
    return this.webhooks.remove(user, workspace, dto.webhookId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('test')
  test(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace, @Body() dto: WebhookIdDto) {
    return this.webhooks.test(user, workspace, dto.webhookId);
  }
}
