// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// MCP-Schnittstelle unter /mcp (Streamable HTTP, zustandslos). Anmeldung mit
// einem API-Schlüssel als Bearer-Token; es gelten die Rechte seines Besitzers.
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  OnModuleDestroy,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import {
  createMcpHandler,
  McpHttpHandler,
  McpRequestContext,
} from '@modelcontextprotocol/server';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiKeyScope } from '../../common/decorators/api-key-scope.decorator';
import { JwtType } from '../../core/auth/dto/jwt-payload';
import { McpCaller, McpToolsService } from './mcp-tools.service';

const CALLER_KEY = 'lt4Caller';

@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpController implements OnModuleDestroy {
  private readonly logger = new Logger(McpController.name);
  private readonly handler: McpHttpHandler;

  constructor(private readonly tools: McpToolsService) {
    this.handler = createMcpHandler(
      (ctx: McpRequestContext) => {
        const caller = ctx.authInfo?.extra?.[CALLER_KEY] as McpCaller;
        if (!caller) throw new Error('Missing caller');
        return this.tools.createServer(caller);
      },
      {
        legacy: 'stateless',
        responseMode: 'json',
        onerror: (err) => this.logger.debug(`MCP: ${err.message}`),
      },
    );
  }

  async onModuleDestroy() {
    await this.handler.close().catch(() => undefined);
  }

  @ApiKeyScope('read')
  @Post()
  async post(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.serve(req, res);
  }

  @ApiKeyScope('read')
  @Get()
  async get(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.serve(req, res);
  }

  @ApiKeyScope('read')
  @Delete()
  async delete(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.serve(req, res);
  }

  private async serve(req: FastifyRequest, res: FastifyReply) {
    const auth: any = (req as any).user;
    const { user, workspace } = auth ?? {};
    if (!user || !workspace) throw new ForbiddenException();

    // Admins schalten die Schnittstelle unter Einstellungen > API-Schlüssel ein.
    if ((workspace.settings as any)?.ai?.mcp !== true) {
      throw new ForbiddenException(
        'The MCP interface is turned off for this workspace',
      );
    }

    const canWrite =
      auth.authType !== JwtType.API_KEY ||
      (auth.apiKey?.scopes ?? []).includes('write');
    const caller: McpCaller = { user, workspace, canWrite };

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    const hasBody = req.method === 'POST' && req.body !== undefined;
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    const response = await this.handler.fetch(request, {
      ...(hasBody ? { parsedBody: req.body } : {}),
      authInfo: {
        token: 'lt4',
        clientId: auth.apiKey?.id ?? user.id,
        scopes: canWrite ? ['read', 'write'] : ['read'],
        extra: { [CALLER_KEY]: caller },
      },
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.header(key, value);
    });
    if (!response.body) return res.send();
    return res.send(Readable.fromWeb(response.body as any));
  }
}
