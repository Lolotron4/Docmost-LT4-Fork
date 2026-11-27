// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Anmeldung für /api/scim/v2: "Authorization: Bearer lt4scim_..." und SCIM
// muss unter Einstellungen > SCIM eingeschaltet sein.
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { ScimError } from './scim.constants';
import { ScimTokenService } from './scim-token.service';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: ScimTokenService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const workspace = (req.raw as any)?.workspace;
    if (!workspace) throw new ScimError(404, 'Workspace not found');

    const header = String(req.headers.authorization ?? '');
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) throw new ScimError(401, 'Missing bearer token');

    const token = await this.tokens.findValid(workspace.id, match[1].trim());
    if (!token) throw new ScimError(401, 'Invalid or revoked SCIM token');
    if (workspace.isScimEnabled !== true) {
      throw new ScimError(403, 'SCIM provisioning is disabled in this workspace');
    }

    (req as any).scimWorkspace = workspace;
    // Änderungen erscheinen im Audit-Log als "System"
    this.auditService.setActorType('system');
    return true;
  }
}
