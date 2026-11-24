// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module, OnModuleInit } from '@nestjs/common';
import { IntegrationModule } from '../../core/integration/integration.module';
import { IntegrationRegistry } from '../../core/integration/registry/integration-registry';
import { GitLabProvider } from './gitlab/gitlab.provider';
import { GitLabService } from './gitlab/gitlab.service';
import { Lt4IntegrationsController } from './lt4-integrations.controller';

@Module({
  imports: [IntegrationModule],
  controllers: [Lt4IntegrationsController],
  providers: [GitLabProvider, GitLabService],
})
export class Lt4IntegrationsModule implements OnModuleInit {
  constructor(
    private readonly registry: IntegrationRegistry,
    private readonly gitlabProvider: GitLabProvider,
  ) {}

  onModuleInit() {
    this.registry.register(this.gitlabProvider);
  }
}
