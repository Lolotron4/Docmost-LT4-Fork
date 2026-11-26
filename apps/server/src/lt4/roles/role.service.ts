// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { executeTx } from '@docmost/db/utils';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  findRole,
  getWorkspaceRoles,
  hasPermission,
  isBelow,
  isOwner,
  LT4_PERMISSIONS,
  Lt4Permission,
  Lt4Role,
  permissionsOf,
  roleKeysOf,
  sanitizePermissions,
  setGroupRoleData,
  setGroupRoleReloadHook,
  setWorkspaceRoles,
} from './role-store';
import {
  CreateRoleDto,
  DeleteRoleDto,
  MoveRoleDto,
  SetGroupRoleDto,
  UpdateRoleDto,
} from './role.dto';

const REFRESH_MS = 60_000;

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

@Injectable()
export class RoleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoleService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async onModuleInit() {
    setGroupRoleReloadHook(() => {
      this.reloadGroupRoles().catch(() => undefined);
    });
    await this.reloadAll();
    // Falls mehrere Prozesse laufen, gleichen sie sich regelmäßig ab.
    this.timer = setInterval(() => {
      this.reloadAll().catch(() => undefined);
    }, REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reloadAll() {
    try {
      const rows = await this.db.selectFrom('lt4Roles').selectAll().execute();
      const byWs = new Map<string, Lt4Role[]>();
      for (const r of rows) {
        const list = byWs.get(r.workspaceId) ?? [];
        list.push(this.toRole(r));
        byWs.set(r.workspaceId, list);
      }
      for (const [ws, list] of byWs) setWorkspaceRoles(ws, list);
      await this.reloadGroupRoles();
    } catch (err) {
      // z. B. vor der Migration
      this.logger.warn(`Rollen konnten nicht geladen werden: ${(err as Error)?.message}`);
    }
  }

  /** Lädt Gruppen-Rollen und daraus die Rollen jeder Person aus Gruppen. */
  async reloadGroupRoles() {
    const groups = await this.db
      .selectFrom('lt4GroupRoles')
      .select(['groupId', 'roleKey'])
      .execute();
    const byGroup = new Map(groups.map((g) => [g.groupId, g.roleKey]));
    const byUser = new Map<string, string[]>();
    if (groups.length) {
      const rows = await this.db
        .selectFrom('groupUsers')
        .innerJoin('lt4GroupRoles', 'lt4GroupRoles.groupId', 'groupUsers.groupId')
        .select(['groupUsers.userId', 'lt4GroupRoles.roleKey'])
        .execute();
      for (const r of rows) {
        const list = byUser.get(r.userId) ?? [];
        if (!list.includes(r.roleKey)) list.push(r.roleKey);
        byUser.set(r.userId, list);
      }
    }
    setGroupRoleData(byGroup, byUser);
  }

  async reloadWorkspace(workspaceId: string, trx?: any) {
    const rows = await (trx ?? this.db)
      .selectFrom('lt4Roles')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .execute();
    setWorkspaceRoles(workspaceId, rows.map((r: any) => this.toRole(r)));
  }

  private toRole(r: any): Lt4Role {
    return {
      key: r.key,
      name: r.name,
      description: r.description ?? null,
      position: r.position,
      permissions: sanitizePermissions(
        typeof r.permissions === 'string'
          ? safeParse(r.permissions)
          : r.permissions,
      ),
      isSystem: r.isSystem,
    };
  }

  // ------------------------------------------------------------------ Lesen

  async list(user: User) {
    const roles = getWorkspaceRoles(user.workspaceId);
    const counts = await this.db
      .selectFrom('users')
      .select(['role'])
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspaceId', '=', user.workspaceId)
      .where('deletedAt', 'is', null)
      .groupBy('role')
      .execute();
    const countOf = new Map(counts.map((c) => [c.role, Number(c.count)]));
    const groupRows = await this.db
      .selectFrom('lt4GroupRoles')
      .innerJoin('groups', 'groups.id', 'lt4GroupRoles.groupId')
      .select(['lt4GroupRoles.groupId', 'lt4GroupRoles.roleKey', 'groups.name'])
      .where('lt4GroupRoles.workspaceId', '=', user.workspaceId)
      .execute();
    const canManageRoles = hasPermission(user, 'roles');
    const canManageMembers = hasPermission(user, 'members');

    return {
      permissions: LT4_PERMISSIONS,
      myRole: user.role,
      myRoles: roleKeysOf(user),
      groupRoles: groupRows.map((g) => ({
        groupId: g.groupId,
        groupName: g.name,
        roleKey: g.roleKey,
      })),
      myPermissions: permissionsOf(user),
      roles: roles.map((r, index) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        isSystem: r.isSystem,
        rank: index,
        userCount: countOf.get(r.key) ?? 0,
        groups: groupRows
          .filter((g) => g.roleKey === r.key)
          .map((g) => ({ id: g.groupId, name: g.name })),
        // Darf ich diese Rolle bearbeiten? Owner alles, sonst nur untergeordnete.
        editable:
          canManageRoles &&
          (isOwner(user) || (r.key !== 'owner' && isBelow(user, r.key))),
        // Darf ich diese Rolle an Personen vergeben?
        assignable:
          canManageMembers &&
          (r.key === 'owner' ? isOwner(user) : isBelow(user, r.key)),
      })),
    };
  }

  // -------------------------------------------------------------- Schreiben

  private assertCanManageRoles(user: User) {
    if (!hasPermission(user, 'roles')) {
      throw new ForbiddenException('You are not allowed to manage roles');
    }
  }

  private assertCanEdit(user: User, key: string) {
    this.assertCanManageRoles(user);
    if (isOwner(user)) return;
    if (key === 'owner' || !isBelow(user, key)) {
      throw new ForbiddenException(
        'You can only edit roles that are below your own role',
      );
    }
  }

  /**
   * Nicht-Owner dürfen nur Rechte vergeben oder entziehen, die sie selbst
   * haben. Alle anderen Rechte der Rolle bleiben unverändert.
   */
  private mergePermissions(
    user: User,
    current: Lt4Permission[],
    wanted: unknown,
  ): Lt4Permission[] {
    const requested = sanitizePermissions(wanted);
    if (isOwner(user)) return requested;
    const mine = new Set(permissionsOf(user));
    return LT4_PERMISSIONS.filter((p) =>
      mine.has(p) ? requested.includes(p) : current.includes(p),
    );
  }

  private normalizeName(name: string) {
    const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
    if (!trimmed) throw new BadRequestException('Name is required');
    if (trimmed.length > 50) throw new BadRequestException('Name is too long');
    return trimmed;
  }

  private assertUniqueName(roles: Lt4Role[], name: string, exceptKey?: string) {
    const lower = name.toLocaleLowerCase();
    if (
      roles.some(
        (r) => r.key !== exceptKey && r.name.toLocaleLowerCase() === lower,
      )
    ) {
      throw new BadRequestException('A role with this name already exists');
    }
  }

  /** Speichert die komplette Rangfolge (inkl. eingebauter Rollen). */
  private async persist(workspaceId: string, roles: Lt4Role[], trx: any) {
    for (let i = 0; i < roles.length; i++) {
      const r = roles[i];
      const values = {
        name: r.name,
        description: r.description,
        position: r.key === 'owner' ? 0 : (i + 1) * 10,
        // jsonb: Arrays würde der pg-Treiber als Postgres-Array senden
        permissions: sql`${JSON.stringify(r.permissions)}::text::jsonb` as any,
        isSystem: r.isSystem,
        updatedAt: new Date(),
      };
      await trx
        .insertInto('lt4Roles')
        .values({ workspaceId, key: r.key, ...values })
        .onConflict((oc: any) =>
          oc.columns(['workspaceId', 'key']).doUpdateSet(values),
        )
        .execute();
    }
  }

  async create(user: User, dto: CreateRoleDto) {
    this.assertCanManageRoles(user);
    const ws = user.workspaceId;
    const roles = getWorkspaceRoles(ws).map((r) => ({ ...r }));
    const name = this.normalizeName(dto.name);
    this.assertUniqueName(roles, name);

    const role: Lt4Role = {
      key: randomUUID(),
      name,
      description: dto.description?.trim() || null,
      position: 0,
      permissions: this.mergePermissions(user, [], dto.permissions),
      isSystem: false,
    };

    // Neue Rollen landen direkt über "Mitglied", aber nie über der eigenen Rolle.
    const myIndex = isOwner(user)
      ? 0
      : roles.findIndex((r) => r.key === user.role);
    let insertAt = roles.findIndex((r) => r.key === 'member');
    if (insertAt <= myIndex) insertAt = roles.length;
    roles.splice(insertAt, 0, role);

    await executeTx(this.db, async (trx) => {
      await this.persist(ws, roles, trx);
    });
    await this.reloadWorkspace(ws);

    this.auditService.log({
      event: AuditEvent.ROLE_CREATED,
      resourceType: AuditResource.ROLE,
      resourceId: role.key,
      changes: { after: { name: role.name, permissions: role.permissions } },
    });
    return this.list(user);
  }

  async update(user: User, dto: UpdateRoleDto) {
    const ws = user.workspaceId;
    const existing = findRole(ws, dto.key);
    if (!existing) throw new NotFoundException('Role not found');
    this.assertCanEdit(user, dto.key);

    const roles = getWorkspaceRoles(ws).map((r) => ({ ...r }));
    const role = roles.find((r) => r.key === dto.key);
    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      this.assertUniqueName(roles, name, role.key);
      role.name = name;
    }
    if (dto.description !== undefined) {
      role.description = dto.description?.trim() || null;
    }
    if (dto.permissions !== undefined && role.key !== 'owner') {
      role.permissions = this.mergePermissions(
        user,
        role.permissions,
        dto.permissions,
      );
    }

    await executeTx(this.db, async (trx) => {
      await this.persist(ws, roles, trx);
    });
    await this.reloadWorkspace(ws);

    this.auditService.log({
      event: AuditEvent.ROLE_UPDATED,
      resourceType: AuditResource.ROLE,
      resourceId: role.key,
      changes: {
        before: {
          name: existing.name,
          description: existing.description,
          permissions: existing.permissions,
        },
        after: {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
        },
      },
    });
    return this.list(user);
  }

  async move(user: User, dto: MoveRoleDto) {
    const ws = user.workspaceId;
    if (dto.key === 'owner') throw new BadRequestException('The owner role is always on top');
    this.assertCanEdit(user, dto.key);
    const roles = getWorkspaceRoles(ws).map((r) => ({ ...r }));
    const i = roles.findIndex((r) => r.key === dto.key);
    if (i < 0) throw new NotFoundException('Role not found');
    const j = dto.direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= roles.length) return this.list(user);
    const other = roles[j];
    if (other.key === 'owner') {
      throw new BadRequestException('The owner role is always on top');
    }
    // Auch die Rolle, mit der getauscht wird, muss unter mir stehen.
    this.assertCanEdit(user, other.key);
    [roles[i], roles[j]] = [roles[j], roles[i]];

    await executeTx(this.db, async (trx) => {
      await this.persist(ws, roles, trx);
    });
    await this.reloadWorkspace(ws);

    this.auditService.log({
      event: AuditEvent.ROLE_UPDATED,
      resourceType: AuditResource.ROLE,
      resourceId: dto.key,
      changes: {
        before: { rank: i },
        after: { rank: j },
      },
    });
    return this.list(user);
  }

  async delete(user: User, dto: DeleteRoleDto) {
    const ws = user.workspaceId;
    const existing = findRole(ws, dto.key);
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystem) {
      throw new BadRequestException('Built-in roles cannot be deleted');
    }
    this.assertCanEdit(user, dto.key);

    const replacement = dto.replacementKey ?? 'member';
    if (replacement === dto.key || !findRole(ws, replacement)) {
      throw new BadRequestException('Invalid replacement role');
    }
    if (
      replacement === 'owner'
        ? !isOwner(user)
        : !isOwner(user) && !isBelow(user, replacement)
    ) {
      throw new ForbiddenException(
        'You can only move members to roles below your own role',
      );
    }

    const roles = getWorkspaceRoles(ws).filter((r) => r.key !== dto.key);
    await executeTx(this.db, async (trx) => {
      await trx
        .updateTable('users')
        .set({ role: replacement })
        .where('workspaceId', '=', ws)
        .where('role', '=', dto.key)
        .execute();
      await trx
        .updateTable('workspaceInvitations')
        .set({ role: replacement === 'owner' ? 'member' : replacement })
        .where('workspaceId', '=', ws)
        .where('role', '=', dto.key)
        .execute();
      await trx
        .updateTable('lt4JoinCodes')
        .set({ role: replacement === 'owner' ? 'member' : replacement })
        .where('workspaceId', '=', ws)
        .where('role', '=', dto.key)
        .execute();
      await trx
        .deleteFrom('lt4Roles')
        .where('workspaceId', '=', ws)
        .where('key', '=', dto.key)
        .execute();
      // Gruppen mit dieser Rolle verlieren sie
      await trx
        .deleteFrom('lt4GroupRoles')
        .where('workspaceId', '=', ws)
        .where('roleKey', '=', dto.key)
        .execute();
      await this.persist(ws, roles, trx);
    });
    await this.reloadWorkspace(ws);
    await this.reloadGroupRoles();

    this.auditService.log({
      event: AuditEvent.ROLE_DELETED,
      resourceType: AuditResource.ROLE,
      resourceId: dto.key,
      changes: {
        before: { name: existing.name, permissions: existing.permissions },
        after: { replacementRole: replacement },
      },
    });
    return this.list(user);
  }

  // ----------------------------------------------------------- Gruppen-Rolle

  /**
   * Rolle einer Gruppe setzen oder entfernen (roleKey null). Braucht das Recht
   * "Mitglieder verwalten"; alte und neue Rolle müssen unter der eigenen stehen.
   */
  async setGroupRole(user: User, dto: SetGroupRoleDto) {
    if (!hasPermission(user, 'members')) {
      throw new ForbiddenException('You are not allowed to assign roles');
    }
    const ws = user.workspaceId;
    const group = await this.db
      .selectFrom('groups')
      .select(['id', 'name'])
      .where('id', '=', dto.groupId)
      .where('workspaceId', '=', ws)
      .executeTakeFirst();
    if (!group) throw new NotFoundException('Group not found');

    const current = await this.db
      .selectFrom('lt4GroupRoles')
      .select('roleKey')
      .where('groupId', '=', group.id)
      .executeTakeFirst();
    if (current && !isBelow(user, current.roleKey)) {
      throw new ForbiddenException('This group has a role above or equal to your own');
    }
    const next = dto.roleKey || null;
    if (next) {
      if (next === 'owner') {
        throw new BadRequestException('The owner role cannot be given to a group');
      }
      if (!findRole(ws, next)) throw new BadRequestException('Unknown role');
      if (!isBelow(user, next)) {
        throw new ForbiddenException('You can only assign roles below your own role');
      }
    }

    if (next) {
      await this.db
        .insertInto('lt4GroupRoles')
        .values({ groupId: group.id, workspaceId: ws, roleKey: next })
        .onConflict((oc) => oc.column('groupId').doUpdateSet({ roleKey: next }))
        .execute();
    } else {
      await this.db.deleteFrom('lt4GroupRoles').where('groupId', '=', group.id).execute();
    }
    await this.reloadGroupRoles();

    this.auditService.log({
      event: AuditEvent.ROLE_UPDATED,
      resourceType: AuditResource.GROUP,
      resourceId: group.id,
      changes: {
        before: { groupRole: current?.roleKey ?? null },
        after: { groupRole: next },
      },
      metadata: { groupName: group.name },
    });
    return this.list(user);
  }
}
