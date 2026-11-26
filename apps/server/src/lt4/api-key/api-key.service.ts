// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// API-Schlüssel: signierte Tokens (Typ api_key), die an eine Zeile in api_keys
// gebunden sind. Widerruf/Ablauf werden bei jeder Anfrage gegen die Datenbank geprüft.
import { hasPermission } from '../roles/role-store';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { TokenService } from '../../core/auth/services/token.service';
import { JwtApiKeyPayload } from '../../core/auth/dto/jwt-payload';
import { isUserDisabled } from '../../common/helpers';
import { CreateApiKeyDto } from './api-key.dto';

const KEY_FIELDS = ['id', 'name', 'scopes', 'creatorId', 'expiresAt', 'lastUsedAt', 'createdAt'] as const;
/** Schlüssel ohne Ablaufdatum bekommen ein sehr langes JWT; maßgeblich ist die DB-Zeile. */
const NO_EXPIRY_JWT = '3650d';
/** lastUsedAt höchstens einmal pro Minute schreiben. */
const LAST_USED_THROTTLE_MS = 60_000;

export function scopesFor(access?: 'read' | 'write'): string[] {
  return access === 'read' ? ['read'] : ['read', 'write'];
}

export function isApiRestricted(workspace: Pick<Workspace, 'settings'>): boolean {
  return (workspace?.settings as any)?.api?.restrictToAdmins === true;
}

const isAdmin = (user: Pick<User, 'role' | 'workspaceId'>) =>
  hasPermission(user, 'api');

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  /** Wird von der JwtStrategy für Tokens vom Typ api_key aufgerufen. */
  async validateApiKey(payload: JwtApiKeyPayload) {
    if (!payload?.apiKeyId || !payload.sub) throw new UnauthorizedException();
    const key = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', payload.apiKeyId)
      .where('workspaceId', '=', payload.workspaceId)
      .where('creatorId', '=', payload.sub)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!key) throw new UnauthorizedException('API key revoked or unknown');
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException('API key expired');
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) throw new UnauthorizedException();
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId, {
      includeTimezone: true,
    } as any);
    if (!user || isUserDisabled(user)) throw new UnauthorizedException();
    if (isApiRestricted(workspace) && !isAdmin(user)) {
      throw new UnauthorizedException('API access is restricted to admins');
    }

    if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > LAST_USED_THROTTLE_MS) {
      this.db
        .updateTable('apiKeys')
        .set({ lastUsedAt: new Date() })
        .where('id', '=', key.id)
        .execute()
        .catch(() => undefined);
    }

    const scopes = Array.isArray(key.scopes) ? (key.scopes as string[]) : ['read', 'write'];
    return { user, workspace, apiKey: { id: key.id, scopes } };
  }

  async list(user: User, workspace: Workspace, all = false) {
    if (all && !isAdmin(user)) throw new ForbiddenException();
    let q = this.db
      .selectFrom('apiKeys')
      .select(KEY_FIELDS as any)
      .select(sql<string>`(select name from users where users.id = api_keys.creator_id)`.as('creatorName'))
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null);
    if (!all) q = q.where('creatorId', '=', user.id);
    return q.orderBy('createdAt', 'desc').limit(500).execute();
  }

  async create(user: User, workspace: Workspace, dto: CreateApiKeyDto) {
    if (isApiRestricted(workspace) && !isAdmin(user)) {
      throw new ForbiddenException('API access is restricted to admins');
    }
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= Date.now() + 60_000) {
        throw new BadRequestException('The expiry date must be in the future');
      }
    }
    const key = await this.db
      .insertInto('apiKeys')
      .values({
        name: dto.name.trim(),
        creatorId: user.id,
        workspaceId: workspace.id,
        expiresAt,
        scopes: sql`${JSON.stringify(scopesFor(dto.access))}::text::jsonb` as any,
      })
      .returning(KEY_FIELDS as any)
      .executeTakeFirst();

    const expiresIn = expiresAt
      ? Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      : NO_EXPIRY_JWT;
    const token = await this.tokenService.generateApiToken({
      apiKeyId: (key as any).id,
      user,
      workspaceId: workspace.id,
      expiresIn: expiresIn as any,
    });
    return { apiKey: key, token };
  }

  private async findManageable(user: User, workspace: Workspace, id: string) {
    const key = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!key) throw new NotFoundException('API key not found');
    if (key.creatorId !== user.id && !isAdmin(user)) throw new ForbiddenException();
    return key;
  }

  async rename(user: User, workspace: Workspace, id: string, name: string) {
    const key = await this.findManageable(user, workspace, id);
    return this.db
      .updateTable('apiKeys')
      .set({ name: name.trim(), updatedAt: new Date() })
      .where('id', '=', key.id)
      .returning(KEY_FIELDS as any)
      .executeTakeFirst();
  }

  async revoke(user: User, workspace: Workspace, id: string) {
    const key = await this.findManageable(user, workspace, id);
    await this.db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', key.id)
      .execute();
  }
}
