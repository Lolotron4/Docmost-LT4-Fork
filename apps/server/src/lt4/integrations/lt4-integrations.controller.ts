// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { IntegrationRegistry } from '../../core/integration/registry/integration-registry';
import { IntegrationRepo } from '../../core/integration/repos/integration.repo';
import { OAuthInstallDto } from '../../core/integration/dto/integration.dto';
import { credentialEnvKey } from '../../core/integration/oauth/credential-env';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

export type Lt4IntegrationStatus = {
  type: string;
  // Client-ID und -Secret der OAuth-App sind gesetzt: Installation und
  // persönliche Verbindungen laufen über OAuth.
  oauthConfigured: boolean;
  // Anbieter kann öffentliche Links ohne Zugangsdaten anzeigen.
  publicPreviews: boolean;
  // Namen der Umgebungsvariablen für die Anleitung im Client.
  envKeys: string[];
};

/**
 * Ergänzt die Integrationen des Kerns: Wer keine OAuth-App anlegen will, kann
 * GitHub und GitLab trotzdem installieren und bekommt Vorschauen für
 * öffentliche Repositories.
 */
@UseGuards(JwtAuthGuard)
@Controller('integrations/lt4')
export class Lt4IntegrationsController {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly integrationRepo: IntegrationRepo,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('status')
  async status(): Promise<Lt4IntegrationStatus[]> {
    // Für alle Mitglieder lesbar (Verbindungen-Seite); enthält keine Geheimnisse.
    return this.registry.getAvailableIntegrations().map((definition) => {
      const provider = this.registry.getProvider(definition.type);
      const oauth = provider?.getOAuthConfig
        ? provider.getOAuthConfig({})
        : definition.oauth;
      const envKeys = oauth
        ? [
            credentialEnvKey('CLIENT_ID', definition.type, oauth),
            credentialEnvKey('CLIENT_SECRET', definition.type, oauth),
          ]
        : [];
      return {
        type: definition.type,
        oauthConfigured:
          envKeys.length > 0 && envKeys.every((key) => !!process.env[key]),
        publicPreviews: typeof provider?.unfurlPublic === 'function',
        envKeys,
      };
    });
  }

  // Installation ohne OAuth: legt nur die Integration an, keine Verbindung.
  @HttpCode(HttpStatus.OK)
  @Post('install')
  async install(
    @Body() dto: OAuthInstallDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);

    const provider = this.registry.getProvider(dto.type);
    if (!provider || provider.definition.hidden) {
      throw new BadRequestException('Unknown integration type');
    }
    if (typeof provider.unfurlPublic !== 'function') {
      throw new BadRequestException(
        'This integration needs an OAuth app to be installed',
      );
    }
    if (provider.definition.requiresFeature) {
      throw new ForbiddenException();
    }
    const existing = await this.integrationRepo.findByWorkspaceAndType(
      workspace.id,
      dto.type,
    );
    if (existing) {
      throw new BadRequestException('Integration is already installed');
    }

    const integration = await this.integrationRepo.insertOrRestore({
      type: dto.type,
      workspaceId: workspace.id,
      installedById: user.id,
    });

    this.auditService.log({
      event: AuditEvent.INTEGRATION_INSTALLED,
      resourceType: AuditResource.INTEGRATION,
      resourceId: integration.id,
      changes: { after: { provider: dto.type, mode: 'public' } },
    });

    return { id: integration.id, type: integration.type };
  }

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}
