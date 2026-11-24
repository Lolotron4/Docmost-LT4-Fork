// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiService } from './ai.service';
import { AiGenerateDto, AiProviderDto, UpdateAiSettingsDto } from './ai.dto';

/** Trennzeichen, mit dem ein Fehler mitten im Stream gemeldet wird. */
export const AI_STREAM_ERROR = '\u0000LT4_AI_ERROR:';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly ai: AiService) {}

  @HttpCode(HttpStatus.OK)
  @Post('settings')
  settings(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.ai.getSettings(user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings/update')
  update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    return this.ai.updateSettings(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('models')
  models(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: AiProviderDto,
  ) {
    return this.ai.listModels(user, workspace, dto.provider);
  }

  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@AuthWorkspace() workspace: Workspace) {
    return this.ai.status(workspace);
  }

  @Post('generate')
  async generate(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: AiGenerateDto,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const start = await this.ai.prepareGenerate(user, workspace, dto);
    const abort = new AbortController();
    req.raw.on('close', () => abort.abort());
    const logger = this.logger;

    async function* body() {
      try {
        for await (const chunk of start(abort.signal)) yield chunk;
      } catch (err: any) {
        if (abort.signal.aborted) return;
        logger.warn(`AI generation failed: ${err?.status ?? ''} ${err?.message ?? err}`);
        const status = err?.status ?? err?.statusCode;
        const message =
          status === 401 || status === 403
            ? 'The AI provider rejected the API key.'
            : status === 429
              ? 'The AI provider is busy or the quota is used up. Please try again later.'
              : status === 404
                ? 'The configured AI model was not found.'
                : 'The AI request failed.';
        yield `${AI_STREAM_ERROR}${message}`;
      }
    }

    res
      .status(200)
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-transform')
      .header('X-Accel-Buffering', 'no');
    return res.send(Readable.from(body()));
  }
}
