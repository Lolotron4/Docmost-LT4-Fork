// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { CreateSsoProviderDto, UpdateSsoProviderDto } from './sso.dto';
import {
  decryptClientSecret,
  encryptClientSecret,
  issuerFor,
  SsoPreset,
} from './sso.util';

export type SsoProviderConfig = {
  id: string;
  workspaceId: string;
  name: string;
  preset: SsoPreset;
  issuer: string | null;
  tenant: string | null;
  clientId: string;
  clientSecret: string;
  allowSignup: boolean;
  isEnabled: boolean;
};

@Injectable()
export class SsoProviderService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  callbackUrl(providerId: string) {
    return `${this.environmentService.getAppUrl()}/api/sso/${providerId}/callback`;
  }

  async list(user: User, workspace: Workspace) {
    this.assertAdmin(user, workspace);
    const rows = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspace.id)
      .where('type', '=', 'oidc')
      .orderBy('createdAt', 'asc')
      .execute();
    return {
      items: rows.map((row) => {
        const cfg = this.toConfig(row);
        return {
          id: cfg.id,
          name: cfg.name,
          preset: cfg.preset,
          issuer: cfg.preset === 'oidc' ? cfg.issuer : null,
          tenant: cfg.tenant,
          clientId: cfg.clientId,
          hasClientSecret: !!row.oidcClientSecret,
          allowSignup: cfg.allowSignup,
          isEnabled: cfg.isEnabled,
          callbackUrl: this.callbackUrl(cfg.id),
        };
      }),
    };
  }

  async create(user: User, workspace: Workspace, dto: CreateSsoProviderDto) {
    this.assertAdmin(user, workspace);
    const row = await this.db
      .insertInto('authProviders')
      .values({
        workspaceId: workspace.id,
        type: 'oidc',
        name: dto.name,
        oidcIssuer: issuerFor(dto.preset, dto.issuer, dto.tenant),
        oidcClientId: dto.clientId,
        oidcClientSecret: encryptClientSecret(
          dto.clientSecret,
          this.environmentService.getAppSecret(),
        ),
        allowSignup: dto.allowSignup ?? false,
        isEnabled: dto.isEnabled ?? true,
        settings: JSON.stringify({ preset: dto.preset, tenant: dto.tenant ?? null }),
        creatorId: user.id,
      })
      .returning('id')
      .executeTakeFirst();
    return { id: row.id, callbackUrl: this.callbackUrl(row.id) };
  }

  async update(user: User, workspace: Workspace, dto: UpdateSsoProviderDto) {
    this.assertAdmin(user, workspace);
    const row = await this.findRow(workspace.id, dto.id);
    const cfg = this.toConfig(row);

    if (dto.isEnabled === false && cfg.isEnabled) {
      await this.assertNotLastEnforced(workspace, dto.id);
    }

    const tenant = dto.tenant ?? cfg.tenant;
    const secret = dto.clientSecret?.trim();
    await this.db
      .updateTable('authProviders')
      .set({
        name: dto.name ?? cfg.name,
        oidcIssuer: issuerFor(cfg.preset, dto.issuer ?? cfg.issuer, tenant),
        oidcClientId: dto.clientId ?? cfg.clientId,
        ...(secret
          ? {
              oidcClientSecret: encryptClientSecret(
                secret,
                this.environmentService.getAppSecret(),
              ),
            }
          : {}),
        allowSignup: dto.allowSignup ?? cfg.allowSignup,
        isEnabled: dto.isEnabled ?? cfg.isEnabled,
        settings: JSON.stringify({ preset: cfg.preset, tenant }),
        updatedAt: new Date(),
      })
      .where('id', '=', row.id)
      .execute();
  }

  async remove(user: User, workspace: Workspace, id: string) {
    this.assertAdmin(user, workspace);
    const row = await this.findRow(workspace.id, id);
    if (row.isEnabled) await this.assertNotLastEnforced(workspace, id);
    // Verknüpfte Konten (auth_accounts) werden per Fremdschlüssel mitgelöscht.
    await this.db.deleteFrom('authProviders').where('id', '=', row.id).execute();
  }

  /** Für den Login-Ablauf: aktiver Anbieter samt entschlüsseltem Geheimnis. */
  async getEnabledConfig(workspaceId: string, id: string): Promise<SsoProviderConfig> {
    const row = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', 'oidc')
      .where('isEnabled', '=', true)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Sign-in provider not found');
    return this.toConfig(row);
  }

  private async findRow(workspaceId: string, id: string) {
    const row = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', 'oidc')
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Sign-in provider not found');
    return row;
  }

  // Bei SSO-Pflicht darf der letzte aktive Anbieter nicht wegfallen (Aussperren).
  private async assertNotLastEnforced(workspace: Workspace, id: string) {
    if (!workspace.enforceSso) return;
    const others = await this.db
      .selectFrom('authProviders')
      .select('id')
      .where('workspaceId', '=', workspace.id)
      .where('isEnabled', '=', true)
      .where('id', '!=', id)
      .execute();
    if (others.length === 0) {
      throw new BadRequestException(
        'This is the last active provider while SSO is enforced. Turn off "Enforce SSO" first.',
      );
    }
  }

  private toConfig(row: any): SsoProviderConfig {
    const settings =
      typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings ?? {};
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      preset: (settings.preset as SsoPreset) ?? 'oidc',
      issuer: row.oidcIssuer,
      tenant: settings.tenant ?? null,
      clientId: row.oidcClientId,
      clientSecret: row.oidcClientSecret
        ? decryptClientSecret(
            row.oidcClientSecret,
            this.environmentService.getAppSecret(),
          )
        : '',
      allowSignup: row.allowSignup,
      isEnabled: row.isEnabled,
    };
  }
}
