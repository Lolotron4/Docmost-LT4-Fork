// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// SCIM 2.0 unter /api/scim/v2 (Basis-URL für Entra ID, Okta, Authentik ...).
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { ScimAuthGuard } from './scim-auth.guard';
import { ScimExceptionFilter } from './scim-exception.filter';
import { ScimListQuery, ScimService, project } from './scim.service';
import { resourceTypes, schemas, serviceProviderConfig } from './scim-discovery';
import { SCIM_CONTENT_TYPE, ScimError } from './scim.constants';

const send = (res: FastifyReply, status: number, body?: unknown) => {
  res.status(status).header('Content-Type', SCIM_CONTENT_TYPE);
  return body === undefined ? res.send() : res.send(body);
};

@UseGuards(ScimAuthGuard)
@UseFilters(ScimExceptionFilter)
@Controller('scim/v2')
export class ScimController {
  constructor(
    private readonly scim: ScimService,
    private readonly environment: EnvironmentService,
  ) {}

  private ws(req: FastifyRequest): Workspace {
    return (req as any).scimWorkspace;
  }

  private baseUrl(): string {
    return `${this.environment.getAppUrl().replace(/\/+$/, '')}/api/scim/v2`;
  }

  // ------------------------------------------------------------ Discovery

  @Get('ServiceProviderConfig')
  spc(@Res() res: FastifyReply) {
    return send(res, 200, serviceProviderConfig(this.baseUrl()));
  }

  @Get('ResourceTypes')
  resourceTypes(@Res() res: FastifyReply) {
    const list = resourceTypes(this.baseUrl());
    return send(res, 200, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: list.length,
      startIndex: 1,
      itemsPerPage: list.length,
      Resources: list,
    });
  }

  @Get('ResourceTypes/:id')
  resourceType(@Param('id') id: string, @Res() res: FastifyReply) {
    const item = resourceTypes(this.baseUrl()).find((r) => r.id === id);
    if (!item) throw new ScimError(404, 'Resource type not found');
    return send(res, 200, item);
  }

  @Get('Schemas')
  schemas(@Res() res: FastifyReply) {
    const list = schemas(this.baseUrl());
    return send(res, 200, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: list.length,
      startIndex: 1,
      itemsPerPage: list.length,
      Resources: list,
    });
  }

  @Get('Schemas/:id')
  schema(@Param('id') id: string, @Res() res: FastifyReply) {
    const item = schemas(this.baseUrl()).find((s) => s.id === id);
    if (!item) throw new ScimError(404, 'Schema not found');
    return send(res, 200, item);
  }

  // ---------------------------------------------------------------- Users

  @Get('Users')
  async listUsers(@Req() req: FastifyRequest, @Query() query: ScimListQuery, @Res() res: FastifyReply) {
    return send(res, 200, await this.scim.listUsers(this.ws(req), query, this.baseUrl()));
  }

  @Get('Users/:id')
  async getUser(@Req() req: FastifyRequest, @Param('id') id: string, @Query() query: ScimListQuery, @Res() res: FastifyReply) {
    return send(res, 200, project(await this.scim.getUser(this.ws(req), id, this.baseUrl()), query));
  }

  @Post('Users')
  async createUser(@Req() req: FastifyRequest, @Body() body: any, @Res() res: FastifyReply) {
    const user = await this.scim.createUser(this.ws(req), body ?? {}, this.baseUrl());
    res.header('Location', user.meta.location);
    return send(res, 201, user);
  }

  @Put('Users/:id')
  async replaceUser(@Req() req: FastifyRequest, @Param('id') id: string, @Body() body: any, @Res() res: FastifyReply) {
    return send(res, 200, await this.scim.replaceUser(this.ws(req), id, body ?? {}, this.baseUrl()));
  }

  @Patch('Users/:id')
  async patchUser(@Req() req: FastifyRequest, @Param('id') id: string, @Body() body: any, @Res() res: FastifyReply) {
    return send(res, 200, await this.scim.patchUser(this.ws(req), id, body ?? {}, this.baseUrl()));
  }

  @Delete('Users/:id')
  async deleteUser(@Req() req: FastifyRequest, @Param('id') id: string, @Res() res: FastifyReply) {
    await this.scim.deleteUser(this.ws(req), id);
    return send(res, 204);
  }

  // --------------------------------------------------------------- Groups

  @Get('Groups')
  async listGroups(@Req() req: FastifyRequest, @Query() query: ScimListQuery, @Res() res: FastifyReply) {
    return send(res, 200, await this.scim.listGroups(this.ws(req), query, this.baseUrl()));
  }

  @Get('Groups/:id')
  async getGroup(@Req() req: FastifyRequest, @Param('id') id: string, @Query() query: ScimListQuery, @Res() res: FastifyReply) {
    const withMembers = !(query.excludedAttributes ?? '').toLowerCase().includes('members');
    return send(res, 200, project(await this.scim.getGroup(this.ws(req), id, this.baseUrl(), withMembers), query));
  }

  @Post('Groups')
  async createGroup(@Req() req: FastifyRequest, @Body() body: any, @Res() res: FastifyReply) {
    const group = await this.scim.createGroup(this.ws(req), body ?? {}, this.baseUrl());
    res.header('Location', group.meta.location);
    return send(res, 201, group);
  }

  @Put('Groups/:id')
  async replaceGroup(@Req() req: FastifyRequest, @Param('id') id: string, @Body() body: any, @Res() res: FastifyReply) {
    return send(res, 200, await this.scim.replaceGroup(this.ws(req), id, body ?? {}, this.baseUrl()));
  }

  @Patch('Groups/:id')
  async patchGroup(@Req() req: FastifyRequest, @Param('id') id: string, @Body() body: any, @Res() res: FastifyReply) {
    return send(res, 200, await this.scim.patchGroup(this.ws(req), id, body ?? {}, this.baseUrl()));
  }

  @Delete('Groups/:id')
  async deleteGroup(@Req() req: FastifyRequest, @Param('id') id: string, @Res() res: FastifyReply) {
    await this.scim.deleteGroup(this.ws(req), id);
    return send(res, 204);
  }
}
