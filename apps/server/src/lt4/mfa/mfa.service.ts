// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectKysely } from 'nestjs-kysely';
import { FastifyReply, FastifyRequest } from 'fastify';
import * as QRCode from 'qrcode';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SessionService } from '../../core/session/session.service';
import { TokenService } from '../../core/auth/services/token.service';
import { JwtType } from '../../core/auth/dto/jwt-payload';
import { LoginDto } from '../../core/auth/dto/login.dto';
import { throwIfEmailNotVerified } from '../../core/auth/auth.util';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';
import { comparePasswordHash, isUserDisabled } from '../../common/helpers';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import {
  buildTotp,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  isTotpCode,
  normalizeCode,
  TOTP_PERIOD,
  validateTotp,
} from './mfa.util';

export const MFA_COOKIE = 'mfaToken';
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPTS_TTL_MS = 15 * 60 * 1000;

type MfaRow = {
  id: string;
  userId: string;
  secret: string | null;
  isEnabled: boolean | null;
  backupCodes: string[] | null;
};

export type MfaLoginState = {
  userHasMfa: boolean;
  requiresMfaSetup: boolean;
  isMfaEnforced: boolean;
};

@Injectable()
export class MfaService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly environmentService: EnvironmentService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  // ---------------------------------------------------------------- Login

  /**
   * Prüft E-Mail und Passwort. Ohne 2FA wird direkt eine Sitzung erzeugt.
   * Mit 2FA (oder Pflicht im Workspace) wird nur ein kurzlebiges MFA-Token
   * als Cookie gesetzt; die Sitzung entsteht erst nach dem zweiten Faktor.
   */
  async checkMfaRequirements(
    loginInput: LoginDto,
    workspace: Workspace,
    res: FastifyReply,
  ): Promise<{ authToken: string } | MfaLoginState> {
    const user = await this.userRepo.findByEmail(
      loginInput.email,
      workspace.id,
      { includePassword: true, includeUserMfa: true },
    );

    const errorMessage = 'Email or password does not match';
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException(errorMessage);
    }
    const isPasswordMatch = await comparePasswordHash(
      loginInput.password,
      user.password,
    );
    if (!isPasswordMatch) {
      throw new UnauthorizedException(errorMessage);
    }

    throwIfEmailNotVerified({
      isCloud: this.environmentService.isCloud(),
      emailVerifiedAt: user.emailVerifiedAt,
      email: user.email,
      workspaceId: workspace.id,
      appSecret: this.environmentService.getAppSecret(),
    });

    const state = this.loginState(user, workspace);
    if (!state.userHasMfa && !state.requiresMfaSetup) {
      return { authToken: await this.completeLogin(user, 'password') };
    }

    const mfaToken = await this.tokenService.generateMfaToken(
      user,
      workspace.id,
    );
    res.setCookie(MFA_COOKIE, mfaToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60,
      secure: this.environmentService.isHttps(),
    });
    return state;
  }

  async getLoginInfo(req: FastifyRequest, workspace: Workspace) {
    const user = await this.resolveLoginUser(req, workspace);
    return this.loginState(user, workspace);
  }

  async loginVerify(
    req: FastifyRequest,
    res: FastifyReply,
    workspace: Workspace,
    code: string,
  ) {
    const user = await this.resolveLoginUser(req, workspace);
    const row = await this.findMfa(user.id, workspace.id);
    if (!row?.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is not set up for this account',
      );
    }
    await this.verifyCode(user, row, code);
    await this.finishLogin(res, user, 'mfa');
  }

  async loginSetup(req: FastifyRequest, workspace: Workspace) {
    const user = await this.resolveLoginUser(req, workspace);
    return this.setup(user, workspace);
  }

  async loginEnable(
    req: FastifyRequest,
    res: FastifyReply,
    workspace: Workspace,
    code: string,
  ) {
    const user = await this.resolveLoginUser(req, workspace);
    const backupCodes = await this.enable(user, workspace, code);
    await this.finishLogin(res, user, 'mfa');
    return { backupCodes };
  }

  // ------------------------------------------------------ Kontoeinstellung

  async getStatus(user: User, workspace: Workspace) {
    const row = await this.findMfa(user.id, workspace.id);
    return {
      isEnabled: !!row?.isEnabled,
      method: 'totp',
      backupCodesRemaining: row?.isEnabled ? (row.backupCodes?.length ?? 0) : 0,
      isEnforced: !!workspace.enforceMfa,
    };
  }

  /** Erzeugt ein neues (noch inaktives) Geheimnis samt QR-Code. */
  async setup(user: User, workspace: Workspace) {
    const existing = await this.findMfa(user.id, workspace.id);
    if (existing?.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = generateTotpSecret();
    const stored = encryptSecret(secret, this.environmentService.getAppSecret());

    await this.db
      .insertInto('userMfa')
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        method: 'totp',
        secret: stored,
        isEnabled: false,
        backupCodes: null,
      })
      .onConflict((oc) =>
        oc.column('userId').doUpdateSet({
          secret: stored,
          isEnabled: false,
          backupCodes: null,
          workspaceId: workspace.id,
          updatedAt: new Date(),
        }),
      )
      .execute();

    const otpauthUrl = buildTotp(
      secret,
      user.email,
      workspace.name || 'Docmost',
    ).toString();
    const qrCode = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    return { secret, otpauthUrl, qrCode };
  }

  /** Aktiviert 2FA nach Bestätigung mit einem Code aus der App. */
  async enable(user: User, workspace: Workspace, code: string) {
    const row = await this.findMfa(user.id, workspace.id);
    if (!row?.secret) {
      throw new BadRequestException('Please start the setup first');
    }
    if (row.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    const normalized = normalizeCode(code);
    if (!isTotpCode(normalized)) {
      throw new BadRequestException('Invalid verification code');
    }
    await this.assertNotLocked(user.id);
    const counter = validateTotp(this.secretOf(row), normalized);
    if (counter === null) {
      await this.registerFailure(user.id);
      throw new BadRequestException('Invalid verification code');
    }
    await this.markTotpUsed(user.id, counter);

    const backupCodes = generateBackupCodes();
    await this.db
      .updateTable('userMfa')
      .set({
        isEnabled: true,
        backupCodes: backupCodes.map(hashBackupCode),
        updatedAt: new Date(),
      })
      .where('id', '=', row.id)
      .execute();

    this.auditService.setActorId(user.id);
    this.auditService.log({
      event: AuditEvent.USER_MFA_ENABLED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
    return backupCodes;
  }

  async disable(user: User, workspace: Workspace, code: string) {
    if (workspace.enforceMfa) {
      throw new ForbiddenException(
        'Two-factor authentication is required in this workspace',
      );
    }
    const row = await this.findMfa(user.id, workspace.id);
    if (!row?.isEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    await this.verifyCode(user, row, code);
    await this.db.deleteFrom('userMfa').where('id', '=', row.id).execute();

    this.auditService.log({
      event: AuditEvent.USER_MFA_DISABLED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
  }

  async regenerateBackupCodes(user: User, workspace: Workspace, code: string) {
    const row = await this.findMfa(user.id, workspace.id);
    if (!row?.isEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    await this.verifyCode(user, row, code);

    const backupCodes = generateBackupCodes();
    await this.db
      .updateTable('userMfa')
      .set({
        backupCodes: backupCodes.map(hashBackupCode),
        updatedAt: new Date(),
      })
      .where('id', '=', row.id)
      .execute();

    this.auditService.log({
      event: AuditEvent.USER_MFA_BACKUP_CODE_GENERATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
    return { backupCodes };
  }

  /** Für die Mitgliederliste: wer hat 2FA aktiviert (nur Admins). */
  async listEnabledUserIds(actor: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(actor, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }
    const rows = await this.db
      .selectFrom('userMfa')
      .select('userId')
      .where('workspaceId', '=', workspace.id)
      .where('isEnabled', '=', true)
      .execute();
    return { userIds: rows.map((r) => r.userId) };
  }

  /** Admins können 2FA eines Mitglieds zurücksetzen (z. B. Handy verloren). */
  async resetForUser(actor: User, workspace: Workspace, userId: string) {
    const ability = this.workspaceAbility.createForUser(actor, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }
    const target = await this.userRepo.findById(userId, workspace.id);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    const result = await this.db
      .deleteFrom('userMfa')
      .where('userId', '=', target.id)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();
    if (Number(result.numDeletedRows ?? 0) === 0) {
      throw new BadRequestException(
        'This member has not set up two-factor authentication',
      );
    }
    await this.cacheManager.del(this.failKey(target.id)).catch(() => undefined);

    this.auditService.log({
      event: AuditEvent.USER_MFA_DISABLED,
      resourceType: AuditResource.USER,
      resourceId: target.id,
      metadata: { resetBy: actor.id },
    });
  }

  // -------------------------------------------------------------- Intern

  private loginState(user: User, workspace: Workspace): MfaLoginState {
    const userHasMfa = !!user?.['mfa']?.isEnabled;
    const isMfaEnforced = !!workspace.enforceMfa;
    return {
      userHasMfa,
      requiresMfaSetup: !userHasMfa && isMfaEnforced,
      isMfaEnforced,
    };
  }

  private async resolveLoginUser(
    req: FastifyRequest,
    workspace: Workspace,
  ): Promise<User> {
    const expired = 'Your login session has expired. Please sign in again.';
    const token = req.cookies?.[MFA_COOKIE];
    if (!token) throw new UnauthorizedException(expired);

    let payload: { sub: string; workspaceId: string };
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.MFA_TOKEN);
    } catch {
      throw new UnauthorizedException(expired);
    }
    if (payload.workspaceId !== workspace.id) {
      throw new UnauthorizedException(expired);
    }

    const user = await this.userRepo.findById(payload.sub, workspace.id, {
      includeUserMfa: true,
    });
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException(expired);
    }
    return user;
  }

  private async finishLogin(res: FastifyReply, user: User, source: string) {
    const authToken = await this.completeLogin(user, source);
    res.clearCookie(MFA_COOKIE, { path: '/' });
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }

  private async completeLogin(user: User, source: string) {
    await this.userRepo.updateLastLogin(user.id, user.workspaceId);
    this.auditService.setActorId(user.id);
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source },
    });
    return this.sessionService.createSessionAndToken(user);
  }

  private async findMfa(
    userId: string,
    workspaceId: string,
  ): Promise<MfaRow | undefined> {
    return this.db
      .selectFrom('userMfa')
      .select(['id', 'userId', 'secret', 'isEnabled', 'backupCodes'])
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  private secretOf(row: MfaRow) {
    return decryptSecret(row.secret, this.environmentService.getAppSecret());
  }

  /** Akzeptiert einen TOTP-Code oder einen (einmaligen) Backup-Code. */
  private async verifyCode(user: User, row: MfaRow, code: string) {
    await this.assertNotLocked(user.id);
    const normalized = normalizeCode(code);

    if (isTotpCode(normalized)) {
      const counter = row.secret
        ? validateTotp(this.secretOf(row), normalized)
        : null;
      if (counter !== null && !(await this.isTotpUsed(user.id, counter))) {
        await this.markTotpUsed(user.id, counter);
        await this.cacheManager.del(this.failKey(user.id)).catch(() => undefined);
        return;
      }
    } else if (normalized.length > 0) {
      const hash = hashBackupCode(normalized);
      const codes = row.backupCodes ?? [];
      if (codes.includes(hash)) {
        await this.db
          .updateTable('userMfa')
          .set({
            backupCodes: codes.filter((c) => c !== hash),
            updatedAt: new Date(),
          })
          .where('id', '=', row.id)
          .execute();
        await this.cacheManager.del(this.failKey(user.id)).catch(() => undefined);
        return;
      }
    }

    await this.registerFailure(user.id);
    throw new BadRequestException('Invalid verification code');
  }

  private failKey(userId: string) {
    return `lt4:mfa:fail:${userId}`;
  }

  private async assertNotLocked(userId: string) {
    const failures =
      (await this.cacheManager.get<number>(this.failKey(userId))) ?? 0;
    if (failures >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Too many failed attempts. Please wait 15 minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async registerFailure(userId: string) {
    const key = this.failKey(userId);
    const failures = (await this.cacheManager.get<number>(key)) ?? 0;
    await this.cacheManager.set(key, failures + 1, FAILED_ATTEMPTS_TTL_MS);
  }

  // Ein TOTP-Code darf nur einmal benutzt werden (Schutz vor Wiederverwendung).
  private usedKey(userId: string, counter: number) {
    return `lt4:mfa:used:${userId}:${counter}`;
  }

  private async isTotpUsed(userId: string, counter: number) {
    return !!(await this.cacheManager.get(this.usedKey(userId, counter)));
  }

  private async markTotpUsed(userId: string, counter: number) {
    await this.cacheManager.set(
      this.usedKey(userId, counter),
      1,
      TOTP_PERIOD * 3 * 1000,
    );
  }
}
