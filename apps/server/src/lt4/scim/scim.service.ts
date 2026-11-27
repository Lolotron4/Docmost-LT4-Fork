// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// SCIM 2.0 (RFC 7643/7644): Konten und Gruppen aus einem Identitätsanbieter
// anlegen, ändern, deaktivieren und löschen.
//
// Grundsätze:
//  - Bestehende Konten werden übernommen statt doppelt angelegt: Fragt der
//    Anbieter nach "userName eq ..." oder legt er ein Konto mit einer schon
//    vorhandenen E-Mail an, verknüpfen wir das vorhandene Konto.
//  - Ohne E-Mail-Adresse entsteht ein Konto mit Benutzername (wie bei den
//    Beitrittslinks), das sich per SSO/LDAP oder Benutzername anmeldet.
//  - Owner-Konten kann SCIM nicht deaktivieren oder löschen.
//  - Die Standardgruppe ("Alle") ist für SCIM unsichtbar.
//  - Für Deaktivieren/Löschen nutzen wir die Kern-Logik (Sitzungen beenden,
//    Echtzeit-Zugriff entziehen, Daten anonymisieren ...).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SignupService } from '../../core/auth/services/signup.service';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { GroupService } from '../../core/group/services/group.service';
import { GroupUserService } from '../../core/group/services/group-user.service';
import { hashPassword } from '../../common/helpers';
import { UserRole } from '../../common/helpers/types/permission';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { scheduleGroupRoleReload } from '../roles/role-store';
import { isUsernameEmail } from '../accounts/username';
import {
  matchesScimFilter,
  parseScimFilter,
  parseScimPatchPath,
  ScimFilter,
  ScimFilterError,
} from './scim-filter';
import {
  applyUserPatch,
  displayNameOf,
  emailFor,
  readPatchOps,
  ScimGroupRef,
  ScimUserRow,
  ScimUserState,
  stateFromRow,
  stateFromScimUser,
  toScimUser,
} from './scim-users';
import { SCIM_GROUP, SCIM_LIST, SCIM_MAX_PAGE, ScimError } from './scim.constants';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ScimListQuery {
  filter?: string;
  startIndex?: string | number;
  count?: string | number;
  attributes?: string;
  excludedAttributes?: string;
}

interface GroupRow {
  id: string;
  name: string;
  scimExternalId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Erfüllt jede Passwortregel; wird nie angezeigt (Anmeldung per SSO/LDAP). */
const randomPassword = () => randomBytes(32).toString('base64url') + 'Aa1!';

@Injectable()
export class ScimService {
  private readonly logger = new Logger('Lt4Scim');

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly signupService: SignupService,
    private readonly workspaceService: WorkspaceService,
    private readonly groupService: GroupService,
    private readonly groupUserService: GroupUserService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /**
   * Die Kern-Funktionen zum Deaktivieren/Löschen erwarten eine handelnde
   * Person. SCIM handelt mit Owner-Befugnis (Owner selbst sind vorher ausgenommen).
   */
  private systemActor(workspace: Workspace): User {
    return { id: '00000000-0000-0000-0000-000000000000', role: UserRole.OWNER, workspaceId: workspace.id } as User;
  }

  // ================================================================ Users

  private userQuery(workspaceId: string) {
    return this.db
      .selectFrom('users')
      .leftJoin('lt4ScimUsers', 'lt4ScimUsers.userId', 'users.id')
      .select([
        'users.id',
        'users.name',
        'users.email',
        'users.role',
        'users.deactivatedAt',
        'users.createdAt',
        'users.updatedAt',
        'users.scimExternalId',
        'lt4ScimUsers.userName as scimUserName',
        'lt4ScimUsers.givenName',
        'lt4ScimUsers.familyName',
      ])
      .where('users.workspaceId', '=', workspaceId)
      .where('users.deletedAt', 'is', null);
  }

  private async groupsOfUsers(workspaceId: string, userIds?: string[]) {
    if (userIds && userIds.length === 0) return new Map<string, ScimGroupRef[]>();
    let q = this.db
      .selectFrom('groupUsers')
      .innerJoin('groups', 'groups.id', 'groupUsers.groupId')
      .select(['groupUsers.userId', 'groups.id', 'groups.name'])
      .where('groups.workspaceId', '=', workspaceId)
      .where('groups.isDefault', '=', false);
    if (userIds) q = q.where('groupUsers.userId', 'in', userIds);
    const rows = await q.execute();
    const map = new Map<string, ScimGroupRef[]>();
    for (const r of rows) {
      const list = map.get(r.userId) ?? [];
      list.push({ id: r.id, name: r.name });
      map.set(r.userId, list);
    }
    return map;
  }

  private async findUserRow(workspaceId: string, id: string) {
    if (!UUID.test(id ?? '')) throw new ScimError(404, 'User not found');
    const row = await this.userQuery(workspaceId).where('users.id', '=', id).executeTakeFirst();
    if (!row) throw new ScimError(404, 'User not found');
    return row as ScimUserRow & { role: string | null };
  }

  async getUser(workspace: Workspace, id: string, baseUrl: string) {
    const row = await this.findUserRow(workspace.id, id);
    const groups = await this.groupsOfUsers(workspace.id, [row.id]);
    return toScimUser(row, groups.get(row.id) ?? [], baseUrl);
  }

  async listUsers(workspace: Workspace, query: ScimListQuery, baseUrl: string) {
    const filter = this.parseFilter(query.filter);
    const rows = (await this.userQuery(workspace.id).orderBy('users.createdAt', 'asc').execute()) as ScimUserRow[];
    const groups = await this.groupsOfUsers(workspace.id);
    const resources = rows.map((r) => toScimUser(r, groups.get(r.id) ?? [], baseUrl));
    return this.listResponse(resources, filter, query);
  }

  async createUser(workspace: Workspace, body: any, baseUrl: string) {
    const state = stateFromScimUser(body);
    const email = emailFor(state);

    await this.assertUserNameFree(workspace.id, state.userName);
    if (state.externalId) await this.assertExternalIdFree(workspace.id, state.externalId);

    // Vorhandenes Konto mit dieser Adresse übernehmen (wenn noch nicht verknüpft)
    const existing = await this.userQuery(workspace.id)
      .where(sql`lower(users.email)`, '=', email.toLowerCase())
      .executeTakeFirst();
    if (existing) {
      if (existing.scimUserName) {
        throw new ScimError(409, 'A user with this email is already provisioned', 'uniqueness');
      }
      await this.applyUserState(workspace, existing as ScimUserRow & { role: string | null }, state, true);
      return this.getUser(workspace, existing.id, baseUrl);
    }

    const userId = await executeTx(this.db, async (trx) => {
      const created = await this.signupService.signup(
        { name: displayNameOf(state), email, password: state.password ?? randomPassword() },
        workspace.id,
        trx,
      );
      await trx
        .updateTable('users')
        .set({
          hasGeneratedPassword: !state.password,
          scimExternalId: state.externalId,
          ...(isUsernameEmail(email) ? {} : { emailVerifiedAt: new Date() }),
          ...(state.active ? {} : { deactivatedAt: new Date() }),
        })
        .where('id', '=', created.id)
        .execute();
      await trx
        .insertInto('lt4ScimUsers')
        .values({
          userId: created.id,
          workspaceId: workspace.id,
          userName: state.userName,
          givenName: state.givenName,
          familyName: state.familyName,
        })
        .execute();
      return created.id;
    });

    this.auditService.log({
      event: AuditEvent.USER_UPDATED,
      resourceType: AuditResource.USER,
      resourceId: userId,
      changes: { after: { scimUserName: state.userName, active: state.active } },
      metadata: { source: 'scim', action: 'provisioned' },
    });
    return this.getUser(workspace, userId, baseUrl);
  }

  async replaceUser(workspace: Workspace, id: string, body: any, baseUrl: string) {
    const row = await this.findUserRow(workspace.id, id);
    const state = stateFromScimUser(body);
    await this.applyUserState(workspace, row, state, false);
    return this.getUser(workspace, id, baseUrl);
  }

  async patchUser(workspace: Workspace, id: string, body: any, baseUrl: string) {
    const row = await this.findUserRow(workspace.id, id);
    const state = applyUserPatch(stateFromRow(row), readPatchOps(body));
    await this.applyUserState(workspace, row, state, false);
    return this.getUser(workspace, id, baseUrl);
  }

  async deleteUser(workspace: Workspace, id: string) {
    const row = await this.findUserRow(workspace.id, id);
    if (row.role === UserRole.OWNER) {
      throw new ScimError(400, 'Owners cannot be deleted via SCIM', 'mutability');
    }
    await this.workspaceService.deleteUser(this.systemActor(workspace), row.id, workspace.id);
    // userName/externalId wieder frei machen (das Konto bleibt anonymisiert bestehen)
    await this.db.deleteFrom('lt4ScimUsers').where('userId', '=', row.id).execute();
    await this.db.updateTable('users').set({ scimExternalId: null }).where('id', '=', row.id).execute();
  }

  /** Schreibt einen neuen Zustand auf ein vorhandenes Konto. */
  private async applyUserState(
    workspace: Workspace,
    row: ScimUserRow & { role: string | null },
    state: ScimUserState,
    adopt: boolean,
  ) {
    const before = stateFromRow(row);
    const isOwner = row.role === UserRole.OWNER;

    if (state.userName.toLowerCase() !== (row.scimUserName ?? '').toLowerCase()) {
      await this.assertUserNameFree(workspace.id, state.userName, row.id);
    }
    if (state.externalId && state.externalId !== row.scimExternalId) {
      await this.assertExternalIdFree(workspace.id, state.externalId, row.id);
    }

    let email = emailFor(state);
    // Konten mit Benutzername behalten ihren Benutzernamen, solange keine echte Adresse kommt
    if (isUsernameEmail(email) && isUsernameEmail(row.email) && !state.email) email = row.email;
    if (email.toLowerCase() !== row.email.toLowerCase()) {
      const taken = await this.db
        .selectFrom('users')
        .select('id')
        .where('workspaceId', '=', workspace.id)
        .where(sql`lower(email)`, '=', email.toLowerCase())
        .where('id', '!=', row.id)
        .executeTakeFirst();
      if (taken) throw new ScimError(409, 'Another user already uses this email', 'uniqueness');
    }

    if (!state.active && isOwner && !row.deactivatedAt) {
      throw new ScimError(400, 'Owners cannot be deactivated via SCIM', 'mutability');
    }

    const name = displayNameOf(state);
    await executeTx(this.db, async (trx) => {
      await trx
        .updateTable('users')
        .set({
          name,
          email,
          scimExternalId: state.externalId,
          ...(state.password
            ? { password: await hashPassword(state.password), hasGeneratedPassword: false }
            : {}),
          updatedAt: new Date(),
        })
        .where('id', '=', row.id)
        .execute();
      await trx
        .insertInto('lt4ScimUsers')
        .values({
          userId: row.id,
          workspaceId: workspace.id,
          userName: state.userName,
          givenName: state.givenName,
          familyName: state.familyName,
        })
        .onConflict((oc) =>
          oc.column('userId').doUpdateSet({
            userName: state.userName,
            givenName: state.givenName,
            familyName: state.familyName,
            updatedAt: new Date(),
          }),
        )
        .execute();
    });

    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};
    if (row.name !== name) {
      changedBefore.name = row.name;
      changedAfter.name = name;
    }
    if (row.email.toLowerCase() !== email.toLowerCase()) {
      changedBefore.email = row.email;
      changedAfter.email = email;
    }
    if (before.userName !== state.userName) {
      changedBefore.scimUserName = before.userName;
      changedAfter.scimUserName = state.userName;
    }
    if (adopt || Object.keys(changedAfter).length || state.password) {
      this.auditService.log({
        event: AuditEvent.USER_UPDATED,
        resourceType: AuditResource.USER,
        resourceId: row.id,
        changes: { before: changedBefore, after: changedAfter },
        metadata: {
          source: 'scim',
          ...(adopt ? { action: 'linked' } : {}),
          ...(state.password ? { passwordChanged: true } : {}),
        },
      });
    }

    // Aktiv/inaktiv über die Kern-Logik (beendet Sitzungen, Echtzeit-Zugriff ...)
    if (!state.active && !row.deactivatedAt) {
      await this.workspaceService.deactivateUser(this.systemActor(workspace), row.id, workspace.id);
    } else if (state.active && row.deactivatedAt) {
      await this.workspaceService.activateUser(this.systemActor(workspace), row.id, workspace.id);
    }
  }

  private async assertUserNameFree(workspaceId: string, userName: string, exceptUserId?: string) {
    let q = this.db
      .selectFrom('lt4ScimUsers')
      .select('userId')
      .where('workspaceId', '=', workspaceId)
      .where(sql`lower(user_name)`, '=', userName.toLowerCase());
    if (exceptUserId) q = q.where('userId', '!=', exceptUserId);
    if (await q.executeTakeFirst()) {
      throw new ScimError(409, 'userName is already in use', 'uniqueness');
    }
  }

  private async assertExternalIdFree(workspaceId: string, externalId: string, exceptUserId?: string) {
    let q = this.db
      .selectFrom('users')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('scimExternalId', '=', externalId)
      .where('deletedAt', 'is', null);
    if (exceptUserId) q = q.where('id', '!=', exceptUserId);
    if (await q.executeTakeFirst()) {
      throw new ScimError(409, 'externalId is already in use', 'uniqueness');
    }
  }

  // =============================================================== Groups

  private groupQuery(workspaceId: string) {
    return this.db
      .selectFrom('groups')
      .select(['groups.id', 'groups.name', 'groups.scimExternalId', 'groups.createdAt', 'groups.updatedAt'])
      .where('groups.workspaceId', '=', workspaceId)
      .where('groups.isDefault', '=', false)
      .where('groups.deletedAt', 'is', null);
  }

  private async membersOf(groupIds: string[]) {
    const map = new Map<string, { id: string; name: string | null }[]>();
    if (!groupIds.length) return map;
    const rows = await this.db
      .selectFrom('groupUsers')
      .innerJoin('users', 'users.id', 'groupUsers.userId')
      .select(['groupUsers.groupId', 'users.id', 'users.name'])
      .where('groupUsers.groupId', 'in', groupIds)
      .where('users.deletedAt', 'is', null)
      .execute();
    for (const r of rows) {
      const list = map.get(r.groupId) ?? [];
      list.push({ id: r.id, name: r.name });
      map.set(r.groupId, list);
    }
    return map;
  }

  private toScimGroup(row: GroupRow, members: { id: string; name: string | null }[] | undefined, baseUrl: string) {
    return {
      schemas: [SCIM_GROUP],
      id: row.id,
      ...(row.scimExternalId && !row.scimExternalId.startsWith('lt4:') ? { externalId: row.scimExternalId } : {}),
      displayName: row.name,
      members: (members ?? []).map((m) => ({
        value: m.id,
        display: m.name ?? undefined,
        $ref: `${baseUrl}/Users/${m.id}`,
        type: 'User',
      })),
      meta: {
        resourceType: 'Group',
        created: new Date(row.createdAt).toISOString(),
        lastModified: new Date(row.updatedAt).toISOString(),
        location: `${baseUrl}/Groups/${row.id}`,
      },
    };
  }

  private async findGroupRow(workspaceId: string, id: string): Promise<GroupRow> {
    if (!UUID.test(id ?? '')) throw new ScimError(404, 'Group not found');
    const row = await this.groupQuery(workspaceId).where('groups.id', '=', id).executeTakeFirst();
    if (!row) throw new ScimError(404, 'Group not found');
    return row;
  }

  async getGroup(workspace: Workspace, id: string, baseUrl: string, withMembers = true) {
    const row = await this.findGroupRow(workspace.id, id);
    const members = withMembers ? await this.membersOf([row.id]) : new Map();
    return this.toScimGroup(row, members.get(row.id), baseUrl);
  }

  async listGroups(workspace: Workspace, query: ScimListQuery, baseUrl: string) {
    const filter = this.parseFilter(query.filter);
    const rows = await this.groupQuery(workspace.id).orderBy('groups.createdAt', 'asc').execute();
    // Mitglieder nur laden, wenn sie gebraucht werden (Entra fragt mit excludedAttributes=members)
    const excluded = csv(query.excludedAttributes);
    const filterNeedsMembers = (query.filter ?? '').toLowerCase().includes('members');
    const needMembers = !excluded.includes('members') || filterNeedsMembers;
    const members = needMembers ? await this.membersOf(rows.map((r) => r.id)) : new Map();
    const resources = rows.map((r) => this.toScimGroup(r, members.get(r.id), baseUrl));
    return this.listResponse(resources, filter, query);
  }

  async createGroup(workspace: Workspace, body: any, baseUrl: string) {
    const displayName = str(body?.displayName);
    if (!displayName) throw new ScimError(400, 'displayName is required', 'invalidValue');
    const externalId = str(body?.externalId);
    const memberIds = memberIdsOf(body?.members);

    const existing = await this.db
      .selectFrom('groups')
      .select(['id', 'isDefault', 'scimExternalId'])
      .where('workspaceId', '=', workspace.id)
      .where(sql`lower(name)`, '=', displayName.toLowerCase())
      .executeTakeFirst();
    let groupId: string;
    if (existing) {
      // Vorhandene Gruppe gleichen Namens übernehmen, statt zu scheitern
      if (existing.isDefault || existing.scimExternalId) {
        throw new ScimError(409, 'A group with this name already exists', 'uniqueness');
      }
      groupId = existing.id;
    } else {
      const created = await this.groupService.createGroup(
        { id: null } as unknown as User,
        workspace.id,
        { name: displayName.slice(0, 100) } as any,
      );
      groupId = created.id;
    }
    await this.db
      .updateTable('groups')
      .set({ scimExternalId: externalId ?? `lt4:${groupId}`, isExternal: true, updatedAt: new Date() })
      .where('id', '=', groupId)
      .execute();
    if (memberIds.length) {
      await this.groupUserService.addUsersToGroupBatch(memberIds, groupId, workspace.id);
      scheduleGroupRoleReload();
    }
    return this.getGroup(workspace, groupId, baseUrl);
  }

  async replaceGroup(workspace: Workspace, id: string, body: any, baseUrl: string) {
    const row = await this.findGroupRow(workspace.id, id);
    const displayName = str(body?.displayName);
    if (!displayName) throw new ScimError(400, 'displayName is required', 'invalidValue');
    await this.updateGroupAttrs(workspace, row, displayName, body?.externalId === undefined ? undefined : str(body.externalId));
    // Fehlt "members", bleiben die Mitglieder unverändert (einige Anbieter schicken sie beim Umbenennen nicht mit)
    if (body?.members !== undefined) {
      await this.setMembers(workspace, row.id, new Set(memberIdsOf(body.members)));
    }
    return this.getGroup(workspace, id, baseUrl);
  }

  async patchGroup(workspace: Workspace, id: string, body: any, baseUrl: string) {
    const row = await this.findGroupRow(workspace.id, id);
    const ops = readPatchOps(body);
    const current = new Set((await this.membersOf([row.id])).get(row.id)?.map((m) => m.id) ?? []);
    const target = new Set(current);
    let displayName = row.name;
    let externalId: string | null | undefined = undefined;

    const applyAttr = (attrPath: string, value: unknown, op: string) => {
      let parsed;
      try {
        parsed = parseScimPatchPath(attrPath);
      } catch (err) {
        if (err instanceof ScimFilterError) throw new ScimError(400, err.message, 'invalidPath');
        throw err;
      }
      if (parsed.attr === 'displayname') {
        if (op === 'remove') throw new ScimError(400, 'displayName cannot be removed', 'mutability');
        displayName = str(value) ?? displayName;
      } else if (parsed.attr === 'externalid') {
        externalId = op === 'remove' ? null : str(value);
      } else if (parsed.attr === 'members') {
        if (parsed.filter) {
          // members[value eq "id"]
          for (const m of [...target]) {
            if (matchesScimFilter({ value: m }, parsed.filter)) target.delete(m);
          }
          if (op !== 'remove') memberIdsOf(value).forEach((m) => target.add(m));
          return;
        }
        const ids = memberIdsOf(value);
        if (op === 'add') ids.forEach((m) => target.add(m));
        else if (op === 'replace') {
          target.clear();
          ids.forEach((m) => target.add(m));
        } else if (op === 'remove') {
          if (value === undefined || value === null) target.clear();
          else ids.forEach((m) => target.delete(m));
        }
      }
      // andere Attribute ignorieren
    };

    for (const op of ops) {
      if (op.path) {
        applyAttr(op.path, op.value, op.op);
        continue;
      }
      if (op.op === 'remove') throw new ScimError(400, 'Remove needs a path', 'noTarget');
      if (!op.value || typeof op.value !== 'object' || Array.isArray(op.value)) {
        throw new ScimError(400, 'Patch value must be an object', 'invalidValue');
      }
      for (const [k, v] of Object.entries(op.value as Record<string, unknown>)) {
        if (['schemas', 'id', 'meta'].includes(k.toLowerCase())) continue;
        applyAttr(k, v, op.op);
      }
    }

    await this.updateGroupAttrs(workspace, row, displayName, externalId);
    await this.applyMemberDiff(workspace, row.id, current, target);
    return this.getGroup(workspace, id, baseUrl);
  }

  async deleteGroup(workspace: Workspace, id: string) {
    const row = await this.findGroupRow(workspace.id, id);
    await this.groupService.deleteGroup(row.id, workspace.id);
    scheduleGroupRoleReload();
  }

  private async updateGroupAttrs(
    workspace: Workspace,
    row: GroupRow,
    displayName: string,
    externalId: string | null | undefined,
  ) {
    if (displayName !== row.name) {
      const clash = await this.db
        .selectFrom('groups')
        .select('id')
        .where('workspaceId', '=', workspace.id)
        .where(sql`lower(name)`, '=', displayName.toLowerCase())
        .where('id', '!=', row.id)
        .executeTakeFirst();
      if (clash) throw new ScimError(409, 'A group with this name already exists', 'uniqueness');
      await this.groupService.updateGroup(workspace.id, { groupId: row.id, name: displayName.slice(0, 100) } as any);
    }
    if (externalId !== undefined && externalId !== row.scimExternalId) {
      await this.db
        .updateTable('groups')
        .set({ scimExternalId: externalId ?? `lt4:${row.id}`, updatedAt: new Date() })
        .where('id', '=', row.id)
        .execute();
    }
  }

  private async setMembers(workspace: Workspace, groupId: string, target: Set<string>) {
    const current = new Set((await this.membersOf([groupId])).get(groupId)?.map((m) => m.id) ?? []);
    await this.applyMemberDiff(workspace, groupId, current, target);
  }

  private async applyMemberDiff(workspace: Workspace, groupId: string, current: Set<string>, target: Set<string>) {
    const toAdd = [...target].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !target.has(id));
    if (toAdd.length) {
      await this.groupUserService.addUsersToGroupBatch(toAdd, groupId, workspace.id);
    }
    for (const userId of toRemove) {
      try {
        await this.groupUserService.removeUserFromGroup(userId, groupId, workspace.id);
      } catch (err: any) {
        this.logger.debug(`SCIM: remove ${userId} from ${groupId}: ${err?.message}`);
      }
    }
    if (toAdd.length || toRemove.length) {
      await this.db.updateTable('groups').set({ updatedAt: new Date() }).where('id', '=', groupId).execute();
      scheduleGroupRoleReload();
    }
  }

  // ========================================================= Hilfsfunktionen

  private parseFilter(filter?: string): ScimFilter | null {
    if (!filter?.trim()) return null;
    try {
      return parseScimFilter(filter);
    } catch (err) {
      if (err instanceof ScimFilterError) throw new ScimError(400, err.message, 'invalidFilter');
      throw err;
    }
  }

  private listResponse(resources: any[], filter: ScimFilter | null, query: ScimListQuery) {
    const matching = filter ? resources.filter((r) => matchesScimFilter(r, filter)) : resources;
    const startIndex = Math.max(1, parseInt(String(query.startIndex ?? '1'), 10) || 1);
    const rawCount = query.count === undefined ? SCIM_MAX_PAGE : parseInt(String(query.count), 10);
    const count = Math.min(SCIM_MAX_PAGE, Math.max(0, Number.isNaN(rawCount) ? SCIM_MAX_PAGE : rawCount));
    const page = matching.slice(startIndex - 1, startIndex - 1 + count);
    return {
      schemas: [SCIM_LIST],
      totalResults: matching.length,
      startIndex,
      itemsPerPage: page.length,
      Resources: page.map((r) => project(r, query)),
    };
  }
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function csv(v?: string): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** [{ value: "uuid" }, ...] oder "uuid" → gültige UUIDs. */
function memberIdsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const ids = list
    .map((m) => (m && typeof m === 'object' ? str((m as any).value) : str(m)))
    .filter((id): id is string => !!id && UUID.test(id));
  return [...new Set(ids)];
}

/** attributes / excludedAttributes (nur oberste Ebene). */
export function project(resource: any, query: Pick<ScimListQuery, 'attributes' | 'excludedAttributes'>) {
  const attrs = csv(query.attributes).map((a) => a.split(':').pop().split('.')[0]);
  const excluded = csv(query.excludedAttributes).map((a) => a.split(':').pop().split('.')[0]);
  const always = new Set(['schemas', 'id']);
  if (attrs.length) {
    const out: any = {};
    for (const [k, v] of Object.entries(resource)) {
      if (always.has(k.toLowerCase()) || attrs.includes(k.toLowerCase())) out[k] = v;
    }
    return out;
  }
  if (excluded.length) {
    const out: any = {};
    for (const [k, v] of Object.entries(resource)) {
      if (always.has(k.toLowerCase()) || !excluded.includes(k.toLowerCase())) out[k] = v;
    }
    return out;
  }
  return resource;
}

