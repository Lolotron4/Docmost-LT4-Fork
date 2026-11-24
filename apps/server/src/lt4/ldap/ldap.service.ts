// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Anmeldung über einen LDAP-Verzeichnisdienst (z. B. OpenLDAP, Active Directory,
// Univention/IServ-LDAP). Nutzt ldapts (MIT) und die Spalten ldap_* aus dem Core-Schema.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { Client } from 'ldapts';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SignupService } from '../../core/auth/services/signup.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { isUserDisabled } from '../../common/helpers';
import { MfaService } from '../mfa/mfa.service';
import {
  decryptClientSecret,
  encryptClientSecret,
  placeholderEmail,
  usernameBase,
} from '../sso/sso.util';
import {
  CreateLdapProviderDto,
  LdapProviderFieldsDto,
  UpdateLdapProviderDto,
} from './ldap.dto';
import {
  buildLdapFilter,
  DEFAULT_LDAP_ATTRIBUTES,
  DEFAULT_LDAP_FILTER,
  firstValue,
  LdapAttributeMap,
  ldapSubject,
} from './ldap.util';

type LdapConfig = {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  bindDn: string | null;
  bindPassword: string;
  baseDn: string;
  userSearchFilter: string;
  attributes: LdapAttributeMap;
  startTls: boolean;
  caCert: string | null;
  allowSignup: boolean;
  isEnabled: boolean;
};

type LdapEntry = {
  subject: string;
  dn: string;
  username: string | null;
  email: string | null;
  name: string | null;
};

const TIMEOUT_MS = 8000;

/** Fehlermeldung, die direkt angezeigt werden darf. */
class LdapUserError extends Error {}

@Injectable()
export class LdapService {
  private readonly logger = new Logger('LT4 LDAP');

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly userRepo: UserRepo,
    private readonly signupService: SignupService,
    private readonly mfaService: MfaService,
  ) {}

  // ------------------------------------------------------------ Verwaltung

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  async list(user: User, workspace: Workspace) {
    this.assertAdmin(user, workspace);
    const rows = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspace.id)
      .where('type', '=', 'ldap')
      .orderBy('createdAt', 'asc')
      .execute();
    return {
      items: rows.map((row) => {
        const c = this.toConfig(row, false);
        return {
          id: c.id,
          name: c.name,
          url: c.url,
          bindDn: c.bindDn,
          hasBindPassword: !!row.ldapBindPassword,
          baseDn: c.baseDn,
          userSearchFilter: c.userSearchFilter,
          usernameAttribute: c.attributes.username,
          emailAttribute: c.attributes.email,
          nameAttribute: c.attributes.name,
          startTls: c.startTls,
          caCert: c.caCert,
          allowSignup: c.allowSignup,
          isEnabled: c.isEnabled,
        };
      }),
    };
  }

  async create(user: User, workspace: Workspace, dto: CreateLdapProviderDto) {
    this.assertAdmin(user, workspace);
    const row = await this.db
      .insertInto('authProviders')
      .values({
        workspaceId: workspace.id,
        type: 'ldap',
        creatorId: user.id,
        ...this.columns(dto, null),
      } as any)
      .returning('id')
      .executeTakeFirst();
    return { id: row.id };
  }

  async update(user: User, workspace: Workspace, dto: UpdateLdapProviderDto) {
    this.assertAdmin(user, workspace);
    const row = await this.findRow(workspace.id, dto.id);
    if (dto.isEnabled === false && row.isEnabled) {
      await this.assertNotLastEnforced(workspace, row.id);
    }
    await this.db
      .updateTable('authProviders')
      .set({ ...this.columns(dto, this.toConfig(row, false)), updatedAt: new Date() } as any)
      .where('id', '=', row.id)
      .execute();
  }

  async remove(user: User, workspace: Workspace, id: string) {
    this.assertAdmin(user, workspace);
    const row = await this.findRow(workspace.id, id);
    if (row.isEnabled) await this.assertNotLastEnforced(workspace, row.id);
    await this.db.deleteFrom('authProviders').where('id', '=', row.id).execute();
  }

  /** Verbindung und Dienstkonto prüfen, optional einen Nutzer suchen. */
  async test(user: User, workspace: Workspace, id: string, username?: string) {
    this.assertAdmin(user, workspace);
    const cfg = this.toConfig(await this.findRow(workspace.id, id), true);
    const client = this.client(cfg);
    try {
      await this.connect(client, cfg);
      if (!username) return { ok: true, message: 'Connection and service account work.' };
      const entries = await this.searchUser(client, cfg, username);
      if (entries.length === 0) return { ok: false, message: 'No user found with this name.' };
      if (entries.length > 1) {
        return { ok: false, message: 'More than one user matches. Make the search filter stricter.' };
      }
      const e = entries[0];
      return {
        ok: true,
        message: 'User found.',
        user: { dn: e.dn, username: e.username, email: e.email, name: e.name },
      };
    } catch (err: any) {
      return { ok: false, message: this.describeError(err) };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  // ------------------------------------------------------------- Anmeldung

  async login(
    workspace: Workspace,
    providerId: string,
    username: string,
    password: string,
    res: FastifyReply,
  ) {
    const row = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspace.id)
      .where('type', '=', 'ldap')
      .where('isEnabled', '=', true)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Sign-in provider not found');
    const cfg = this.toConfig(row, true);

    // Ein leeres Passwort wäre bei vielen Servern eine anonyme Anmeldung
    if (!password || !username.trim()) {
      throw new UnauthorizedException('Username or password is wrong.');
    }

    let entry: LdapEntry;
    try {
      entry = await this.authenticate(cfg, username, password);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`LDAP-Anmeldung fehlgeschlagen: ${this.describeError(err)}`);
      throw new BadRequestException('The directory server could not be reached. Please try again later.');
    }

    let user: User;
    try {
      user = await this.resolveUser(workspace, cfg, entry);
    } catch (err: any) {
      if (err instanceof LdapUserError) throw new BadRequestException(err.message);
      throw err;
    }

    const mfa = await this.mfaService.startSecondFactor(user.id, workspace, res);
    if (mfa?.userHasMfa) return { userHasMfa: true };
    if (mfa?.requiresMfaSetup) return { requiresMfaSetup: true };

    const authToken = await this.mfaService.createLoginSession(user, 'ldap');
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
    return {};
  }

  private async authenticate(cfg: LdapConfig, username: string, password: string) {
    const client = this.client(cfg);
    try {
      await this.connect(client, cfg);
      const entries = await this.searchUser(client, cfg, username);
      if (entries.length !== 1) {
        throw new UnauthorizedException('Username or password is wrong.');
      }
      const entry = entries[0];
      try {
        await client.bind(entry.dn, password);
      } catch (err: any) {
        if (this.isInvalidCredentials(err)) {
          throw new UnauthorizedException('Username or password is wrong.');
        }
        throw err;
      }
      return entry;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private client(cfg: LdapConfig) {
    return new Client({
      url: cfg.url,
      timeout: TIMEOUT_MS,
      connectTimeout: TIMEOUT_MS,
      tlsOptions: this.tlsOptions(cfg),
    });
  }

  private tlsOptions(cfg: LdapConfig) {
    return cfg.caCert ? { ca: [cfg.caCert] } : {};
  }

  private async connect(client: Client, cfg: LdapConfig) {
    if (cfg.startTls && cfg.url.toLowerCase().startsWith('ldap://')) {
      await client.startTLS(this.tlsOptions(cfg));
    }
    if (cfg.bindDn) await client.bind(cfg.bindDn, cfg.bindPassword);
  }

  private async searchUser(client: Client, cfg: LdapConfig, username: string) {
    const a = cfg.attributes;
    const { searchEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter: buildLdapFilter(cfg.userSearchFilter, username),
      attributes: [a.username, a.email, a.name, 'entryUUID', 'objectGUID'],
      explicitBufferAttributes: ['objectGUID'],
      sizeLimit: 2,
      timeLimit: 8,
    }).catch((err: any) => {
      // Mehr als ein Treffer -> sizeLimit überschritten
      if (/size ?limit/i.test(err?.message ?? '')) return { searchEntries: [{}, {}] as any[] };
      throw err;
    });
    return searchEntries.map((e: any): LdapEntry => ({
      subject: e.dn ? ldapSubject(e) : '',
      dn: e.dn,
      username: firstValue(e[a.username]),
      email: firstValue(e[a.email])?.toLowerCase() ?? null,
      name: firstValue(e[a.name]),
    }));
  }

  /** Konto zum LDAP-Eintrag finden, per E-Mail verknüpfen oder anlegen. */
  private async resolveUser(workspace: Workspace, cfg: LdapConfig, entry: LdapEntry) {
    const account = await this.db
      .selectFrom('authAccounts')
      .select('userId')
      .where('authProviderId', '=', cfg.id)
      .where('providerUserId', '=', entry.subject)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();
    if (account) {
      const user = await this.userRepo.findById(account.userId, workspace.id);
      if (!user || isUserDisabled(user)) throw new LdapUserError('This account is deactivated.');
      await this.refreshProfile(user, entry);
      return user;
    }

    if (entry.email) {
      const existing = await this.userRepo.findByEmail(entry.email, workspace.id);
      if (existing) {
        if (isUserDisabled(existing)) throw new LdapUserError('This account is deactivated.');
        await this.insertLink(existing.id, workspace.id, cfg.id, entry.subject);
        return existing;
      }
    }

    if (!cfg.allowSignup) {
      throw new LdapUserError('No account found. Ask an admin for a join link or an invitation.');
    }

    const email =
      entry.email ?? (await this.freePlaceholderEmail(workspace.id, entry));
    return executeTx(this.db, async (trx) => {
      const user = await this.signupService.signup(
        {
          name: (entry.name || entry.username || email.split('@')[0]).slice(0, 50),
          email,
          password: randomBytes(32).toString('base64url') + 'Aa1!',
        },
        workspace.id,
        trx,
      );
      await trx
        .updateTable('users')
        .set({
          hasGeneratedPassword: true,
          ...(entry.email ? { emailVerifiedAt: new Date() } : {}),
        })
        .where('id', '=', user.id)
        .execute();
      await this.insertLink(user.id, workspace.id, cfg.id, entry.subject, trx);
      return user;
    });
  }

  /** Namen aus dem Verzeichnis übernehmen, wenn er sich dort geändert hat. */
  private async refreshProfile(user: User, entry: LdapEntry) {
    const name = entry.name?.slice(0, 50);
    if (name && name !== user.name) {
      await this.db.updateTable('users').set({ name }).where('id', '=', user.id).execute();
    }
  }

  private insertLink(userId: string, workspaceId: string, providerId: string, subject: string, trx?: any) {
    return (trx ?? this.db)
      .insertInto('authAccounts')
      .values({ userId, workspaceId, authProviderId: providerId, providerUserId: subject })
      .onConflict((oc: any) =>
        oc.columns(['userId', 'authProviderId']).doUpdateSet({
          providerUserId: subject,
          updatedAt: new Date(),
        }),
      )
      .execute();
  }

  private async freePlaceholderEmail(workspaceId: string, entry: LdapEntry) {
    const base = usernameBase({ username: entry.username, name: entry.name } as any);
    for (let i = 0; i < 50; i++) {
      const candidate = placeholderEmail(i === 0 ? base : `${base}${i + 1}`);
      if (!(await this.userRepo.findByEmail(candidate, workspaceId))) return candidate;
    }
    return placeholderEmail(`${base}.${randomBytes(3).toString('hex')}`);
  }

  // ------------------------------------------------------------- Hilfen

  private async findRow(workspaceId: string, id: string) {
    const row = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', 'ldap')
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Sign-in provider not found');
    return row;
  }

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

  private columns(dto: LdapProviderFieldsDto, current: LdapConfig | null) {
    const pick = <T>(v: T | undefined, fallback: T) => (v === undefined ? fallback : v);
    const attrs: LdapAttributeMap = {
      username: pick(dto.usernameAttribute, current?.attributes.username ?? DEFAULT_LDAP_ATTRIBUTES.username) || DEFAULT_LDAP_ATTRIBUTES.username,
      email: pick(dto.emailAttribute, current?.attributes.email ?? DEFAULT_LDAP_ATTRIBUTES.email) || DEFAULT_LDAP_ATTRIBUTES.email,
      name: pick(dto.nameAttribute, current?.attributes.name ?? DEFAULT_LDAP_ATTRIBUTES.name) || DEFAULT_LDAP_ATTRIBUTES.name,
    };
    const password = dto.bindPassword?.length ? dto.bindPassword : null;
    return {
      name: pick(dto.name, current?.name ?? ''),
      ldapUrl: pick(dto.url, current?.url ?? ''),
      ldapBindDn: pick(dto.bindDn, current?.bindDn ?? null) || null,
      ...(password
        ? { ldapBindPassword: encryptClientSecret(password, this.environmentService.getAppSecret()) }
        : {}),
      ldapBaseDn: pick(dto.baseDn, current?.baseDn ?? ''),
      ldapUserSearchFilter: pick(dto.userSearchFilter, current?.userSearchFilter ?? DEFAULT_LDAP_FILTER) || DEFAULT_LDAP_FILTER,
      ldapUserAttributes: JSON.stringify(attrs),
      ldapTlsEnabled: pick(dto.startTls, current?.startTls ?? false),
      ldapTlsCaCert: pick(dto.caCert, current?.caCert ?? null)?.trim() || null,
      allowSignup: pick(dto.allowSignup, current?.allowSignup ?? false),
      isEnabled: pick(dto.isEnabled, current?.isEnabled ?? true),
    };
  }

  private toConfig(row: any, withSecret: boolean): LdapConfig {
    const attrs =
      typeof row.ldapUserAttributes === 'string'
        ? JSON.parse(row.ldapUserAttributes)
        : row.ldapUserAttributes ?? {};
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      url: row.ldapUrl ?? '',
      bindDn: row.ldapBindDn ?? null,
      bindPassword:
        withSecret && row.ldapBindPassword
          ? decryptClientSecret(row.ldapBindPassword, this.environmentService.getAppSecret())
          : '',
      baseDn: row.ldapBaseDn ?? '',
      userSearchFilter: row.ldapUserSearchFilter || DEFAULT_LDAP_FILTER,
      attributes: { ...DEFAULT_LDAP_ATTRIBUTES, ...attrs },
      startTls: !!row.ldapTlsEnabled,
      caCert: row.ldapTlsCaCert ?? null,
      allowSignup: row.allowSignup,
      isEnabled: row.isEnabled,
    };
  }

  private isInvalidCredentials(err: any) {
    return err?.code === 49 || /invalid ?credentials/i.test(err?.message ?? '');
  }

  private describeError(err: any): string {
    if (this.isInvalidCredentials(err)) return 'The service account (bind DN or password) was rejected.';
    const msg = String(err?.message ?? err);
    if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|timeout|timed out/i.test(msg)) {
      return 'The directory server could not be reached.';
    }
    if (/certificate|self.signed|TLS|SSL/i.test(msg)) {
      return 'The TLS connection failed. Check the certificate (CA).';
    }
    if (/no such object/i.test(msg)) return 'The base DN was not found.';
    if (/filter/i.test(msg)) return 'The search filter is invalid.';
    return msg.slice(0, 200);
  }
}
