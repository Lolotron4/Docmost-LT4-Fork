// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SignupService } from '../../core/auth/services/signup.service';
import { validateSsoEnforcement } from '../../core/auth/auth.util';
import { SessionService } from '../../core/session/session.service';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { UserRole } from '../../common/helpers/types/permission';
import { hashPassword } from '../../common/helpers';
import { WsService } from '../../ws/ws.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';
import {
  CreateJoinCodeDto,
  JoinRegisterDto,
  SetMemberPasswordDto,
} from './accounts.dto';
import { isUsernameEmail, usernameToEmail } from './username';

// Ohne verwechselbare Zeichen (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  const block = () =>
    Array.from(
      { length: 4 },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
  return `${block()}-${block()}-${block()}`;
}

/** "abcd efgh-jkmn" → "ABCD-EFGH-JKMN" */
export function normalizeJoinCode(code: string): string {
  const raw = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.match(/.{1,4}/g)?.join('-') ?? '';
}

type JoinCodeRow = {
  id: string;
  workspaceId: string;
  code: string;
  role: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

@Injectable()
export class JoinCodeService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly signupService: SignupService,
    private readonly sessionService: SessionService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly wsService: WsService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  // ------------------------------------------------------------ Verwaltung

  private assertCanManage(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }
  }

  async list(user: User, workspace: Workspace) {
    this.assertCanManage(user, workspace);
    const items = await this.db
      .selectFrom('lt4JoinCodes')
      .leftJoin('users', 'users.id', 'lt4JoinCodes.creatorId')
      .select([
        'lt4JoinCodes.id',
        'lt4JoinCodes.code',
        'lt4JoinCodes.role',
        'lt4JoinCodes.maxUses',
        'lt4JoinCodes.useCount',
        'lt4JoinCodes.expiresAt',
        'lt4JoinCodes.createdAt',
        'users.name as creatorName',
      ])
      .where('lt4JoinCodes.workspaceId', '=', workspace.id)
      .where('lt4JoinCodes.revokedAt', 'is', null)
      .orderBy('lt4JoinCodes.createdAt', 'desc')
      .execute();
    return {
      items: items.map((item) => ({
        ...item,
        isActive: this.problemOf(item as any) === null,
      })),
    };
  }

  async create(user: User, workspace: Workspace, dto: CreateJoinCodeDto) {
    this.assertCanManage(user, workspace);
    if (dto.role === UserRole.ADMIN && user.role === UserRole.MEMBER) {
      throw new ForbiddenException();
    }
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    return this.db
      .insertInto('lt4JoinCodes')
      .values({
        workspaceId: workspace.id,
        code: generateJoinCode(),
        role: dto.role,
        maxUses: dto.maxUses ?? null,
        expiresAt,
        creatorId: user.id,
      })
      .returning(['id', 'code', 'role', 'maxUses', 'useCount', 'expiresAt', 'createdAt'])
      .executeTakeFirst();
  }

  async revoke(user: User, workspace: Workspace, id: string) {
    this.assertCanManage(user, workspace);
    const result = await this.db
      .updateTable('lt4JoinCodes')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspace.id)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows ?? 0) === 0) {
      throw new NotFoundException('Join link not found');
    }
  }

  // ------------------------------------------------------- Registrierung

  async getInfo(workspace: Workspace, code: string) {
    const row = await this.findByCode(workspace.id, code);
    const problem = row ? this.problemOf(row) : 'This join link is invalid';
    return {
      valid: problem === null,
      reason: problem,
      workspaceName: workspace.name,
      role: problem === null ? row.role : null,
    };
  }

  /**
   * Legt ein Konto mit E-Mail oder Benutzername an. Die Nutzung des Codes wird
   * in derselben Transaktion gezählt, damit "max. Nutzungen" auch bei
   * gleichzeitigen Anmeldungen hält.
   */
  async register(workspace: Workspace, dto: JoinRegisterDto) {
    // Bei SSO-Pflicht nur über einen SSO-Anbieter beitreten.
    validateSsoEnforcement(workspace);
    const email =
      dto.method === 'username'
        ? usernameToEmail(dto.username)
        : dto.email.trim();

    const existing = await this.userRepo.findByEmail(email, workspace.id);
    if (existing) {
      throw new BadRequestException(
        dto.method === 'username'
          ? 'This username is already taken'
          : 'An account with this email already exists in this workspace',
      );
    }

    const user = await executeTx(this.db, async (trx) => {
      const codeRole = await this.consumeInTx(trx, workspace.id, dto.code);

      const created = await this.signupService.signup(
        { name: dto.name, email, password: dto.password },
        workspace.id,
        trx,
      );

      const role = codeRole;
      await trx
        .updateTable('users')
        .set({ role })
        .where('id', '=', created.id)
        .execute();
      created.role = role;
      return created;
    });

    if (workspace.enforceMfa) {
      // Der Login-Schritt fordert dann zur Einrichtung der 2FA auf.
      return { requiresLogin: true as const };
    }
    const authToken = await this.sessionService.createSessionAndToken(user);
    return { requiresLogin: false as const, authToken };
  }

  /**
   * Prüft den Code und zählt eine Nutzung (in der Transaktion des Aufrufers,
   * mit Zeilensperre). Gibt die Rolle für das neue Konto zurück.
   */
  async consumeInTx(
    trx: KyselyTransaction,
    workspaceId: string,
    code: string,
  ): Promise<UserRole.ADMIN | UserRole.MEMBER> {
    const row = await trx
      .selectFrom('lt4JoinCodes')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('code', '=', normalizeJoinCode(code))
      .forUpdate()
      .executeTakeFirst();
    const problem = row ? this.problemOf(row) : 'This join link is invalid';
    if (problem) throw new BadRequestException(problem);

    await trx
      .updateTable('lt4JoinCodes')
      .set({ useCount: sql`use_count + 1` })
      .where('id', '=', row.id)
      .execute();
    return row.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.MEMBER;
  }

  // -------------------------------------------- Admin: Passwort setzen

  async setMemberPassword(
    actor: User,
    workspace: Workspace,
    dto: SetMemberPasswordDto,
  ) {
    this.assertCanManage(actor, workspace);
    const target = await this.userRepo.findById(dto.userId, workspace.id);
    if (!target) throw new NotFoundException('User not found');
    if (target.role === UserRole.OWNER && actor.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only an owner can change the password of an owner');
    }

    await this.userRepo.updateUser(
      { password: await hashPassword(dto.password), hasGeneratedPassword: true },
      target.id,
      workspace.id,
    );
    // Alle Sitzungen beenden, damit das neue Passwort sofort gilt.
    await this.userSessionRepo.deleteByUserId(target.id, workspace.id);
    this.wsService.disconnectUser(target.id);

    this.auditService.log({
      event: AuditEvent.USER_PASSWORD_RESET,
      resourceType: AuditResource.USER,
      resourceId: target.id,
      metadata: { source: 'admin', resetBy: actor.id },
    });
    return { isUsernameAccount: isUsernameEmail(target.email) };
  }

  // ---------------------------------------------------------------- Intern

  private findByCode(workspaceId: string, code: string) {
    return this.db
      .selectFrom('lt4JoinCodes')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('code', '=', normalizeJoinCode(code))
      .executeTakeFirst() as Promise<JoinCodeRow | undefined>;
  }

  private problemOf(row: JoinCodeRow): string | null {
    if (row.revokedAt) return 'This join link is invalid';
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      return 'This join link has expired';
    }
    if (row.maxUses !== null && row.useCount >= row.maxUses) {
      return 'This join link has reached its maximum number of uses';
    }
    return null;
  }
}
