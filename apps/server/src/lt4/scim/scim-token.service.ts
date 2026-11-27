// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Tokens für den SCIM-Zugang (Kern-Tabelle scim_tokens). Gespeichert wird nur
// ein SHA-256-Hash; das Token selbst wird genau einmal beim Erstellen gezeigt.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { hasPermission } from '../roles/role-store';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { SCIM_TOKEN_PREFIX } from './scim.constants';

const TOKEN_FIELDS = ['id', 'name', 'tokenLastFour', 'lastUsedAt', 'isEnabled', 'creatorId', 'createdAt'] as const;
const LAST_USED_THROTTLE_MS = 60_000;
const MAX_TOKENS = 20;

export function hashScimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ScimTokenService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private assertAllowed(user: User) {
    if (!hasPermission(user, 'scim')) throw new ForbiddenException();
  }

  /** Für den Guard: gültiges Token → Token-Zeile, sonst null. */
  async findValid(workspaceId: string, token: string) {
    if (!token?.startsWith(SCIM_TOKEN_PREFIX)) return null;
    const row = await this.db
      .selectFrom('scimTokens')
      .select(['id', 'lastUsedAt'])
      .where('workspaceId', '=', workspaceId)
      .where('tokenHash', '=', hashScimToken(token))
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    if (!row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > LAST_USED_THROTTLE_MS) {
      this.db
        .updateTable('scimTokens')
        .set({ lastUsedAt: new Date() })
        .where('id', '=', row.id)
        .execute()
        .catch(() => undefined);
    }
    return row;
  }

  async overview(user: User, workspace: Workspace) {
    this.assertAllowed(user);
    const tokens = await this.db
      .selectFrom('scimTokens')
      .select(TOKEN_FIELDS as any)
      .select((eb) =>
        eb
          .selectFrom('users')
          .select('users.name')
          .whereRef('users.id', '=', 'scimTokens.creatorId')
          .as('creatorName'),
      )
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();
    const managed = await this.db
      .selectFrom('lt4ScimUsers')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();
    const groups = await this.db
      .selectFrom('groups')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('workspaceId', '=', workspace.id)
      .where('scimExternalId', 'is not', null)
      .executeTakeFirst();
    return {
      enabled: workspace.isScimEnabled === true,
      tokens,
      managedUsers: Number(managed?.count ?? 0),
      managedGroups: Number(groups?.count ?? 0),
    };
  }

  async setEnabled(user: User, workspace: Workspace, enabled: boolean) {
    this.assertAllowed(user);
    await this.db
      .updateTable('workspaces')
      .set({ isScimEnabled: enabled, updatedAt: new Date() })
      .where('id', '=', workspace.id)
      .execute();
    this.auditService.log({
      event: AuditEvent.WORKSPACE_UPDATED,
      resourceType: AuditResource.WORKSPACE,
      resourceId: workspace.id,
      changes: {
        before: { isScimEnabled: workspace.isScimEnabled === true },
        after: { isScimEnabled: enabled },
      },
    });
    return { enabled };
  }

  async create(user: User, workspace: Workspace, name: string) {
    this.assertAllowed(user);
    const clean = (name ?? '').trim().slice(0, 100);
    if (!clean) throw new BadRequestException('Please enter a name');
    const count = await this.db
      .selectFrom('scimTokens')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (Number(count?.count ?? 0) >= MAX_TOKENS) {
      throw new BadRequestException('Too many SCIM tokens');
    }
    const token = SCIM_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const row = await this.db
      .insertInto('scimTokens')
      .values({
        name: clean,
        tokenHash: hashScimToken(token),
        tokenLastFour: token.slice(-4),
        creatorId: user.id,
        workspaceId: workspace.id,
      })
      .returning(TOKEN_FIELDS as any)
      .executeTakeFirst();
    this.auditService.log({
      event: AuditEvent.SCIM_TOKEN_CREATED,
      resourceType: AuditResource.SCIM_TOKEN,
      resourceId: (row as any).id,
      changes: { after: { name: clean } },
    });
    return { token, scimToken: row };
  }

  async setTokenEnabled(user: User, workspace: Workspace, id: string, enabled: boolean) {
    this.assertAllowed(user);
    const row = await this.find(workspace, id);
    await this.db
      .updateTable('scimTokens')
      .set({ isEnabled: enabled, updatedAt: new Date() })
      .where('id', '=', row.id)
      .execute();
    this.auditService.log({
      event: AuditEvent.SCIM_TOKEN_UPDATED,
      resourceType: AuditResource.SCIM_TOKEN,
      resourceId: row.id,
      changes: { before: { isEnabled: row.isEnabled }, after: { isEnabled: enabled } },
      metadata: { name: row.name },
    });
  }

  async remove(user: User, workspace: Workspace, id: string) {
    this.assertAllowed(user);
    const row = await this.find(workspace, id);
    await this.db
      .updateTable('scimTokens')
      .set({ deletedAt: new Date(), isEnabled: false })
      .where('id', '=', row.id)
      .execute();
    this.auditService.log({
      event: AuditEvent.SCIM_TOKEN_DELETED,
      resourceType: AuditResource.SCIM_TOKEN,
      resourceId: row.id,
      changes: { before: { name: row.name } },
    });
  }

  private async find(workspace: Workspace, id: string) {
    const row = await this.db
      .selectFrom('scimTokens')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('SCIM token not found');
    return row;
  }
}
