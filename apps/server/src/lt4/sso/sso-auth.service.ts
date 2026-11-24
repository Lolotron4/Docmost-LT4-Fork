// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SignupService } from '../../core/auth/services/signup.service';
import { TokenService } from '../../core/auth/services/token.service';
import { JwtType } from '../../core/auth/dto/jwt-payload';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { isUserDisabled } from '../../common/helpers';
import { UserRole } from '../../common/helpers/types/permission';
import { MfaService } from '../mfa/mfa.service';
import { JoinCodeService } from '../accounts/join-code.service';
import { SsoProviderConfig, SsoProviderService } from './sso-provider.service';
import {
  DISCORD,
  openState,
  placeholderEmail,
  profileFromClaims,
  profileFromDiscord,
  safeRedirect,
  sealState,
  SSO_STATE_COOKIE,
  SsoProfile,
  SsoState,
  usernameBase,
} from './sso.util';

/** Fehler, die dem Nutzer auf der Login-Seite angezeigt werden. */
export class SsoUserError extends Error {}

type StartOptions = {
  mode: 'login' | 'join' | 'link';
  redirect?: string;
  joinCode?: string;
};

const CONFIG_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SsoAuthService {
  private readonly logger = new Logger('LT4 SSO');
  private readonly configCache = new Map<
    string,
    { key: string; config: oidc.Configuration; at: number }
  >();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providers: SsoProviderService,
    private readonly userRepo: UserRepo,
    private readonly signupService: SignupService,
    private readonly tokenService: TokenService,
    private readonly environmentService: EnvironmentService,
    private readonly mfaService: MfaService,
    private readonly joinCodeService: JoinCodeService,
  ) {}

  // ------------------------------------------------------------- Start

  async start(
    workspace: Workspace,
    providerId: string,
    opts: StartOptions,
    res: FastifyReply,
  ): Promise<string> {
    const provider = await this.providers.getEnabledConfig(workspace.id, providerId);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const redirectUri = this.providers.callbackUrl(provider.id);

    let url: string;
    if (provider.preset === 'discord') {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: provider.clientId,
        scope: 'identify email',
        state,
        redirect_uri: redirectUri,
        prompt: 'none',
      });
      url = `${DISCORD.authorize}?${params.toString()}`;
    } else {
      const config = await this.getConfig(provider);
      url = oidc
        .buildAuthorizationUrl(config, {
          redirect_uri: redirectUri,
          scope: 'openid email profile',
          state,
          nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
          code_challenge_method: 'S256',
        })
        .toString();
    }

    res.setCookie(
      SSO_STATE_COOKIE,
      sealState(
        {
          providerId: provider.id,
          state,
          nonce,
          codeVerifier,
          mode: opts.mode,
          redirect: safeRedirect(opts.redirect),
          joinCode: opts.joinCode,
        },
        this.environmentService.getAppSecret(),
      ),
      {
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/sso',
        maxAge: 10 * 60,
        secure: this.environmentService.isHttps(),
      },
    );
    return url;
  }

  // ---------------------------------------------------------- Rückkehr

  /** Gibt die Adresse zurück, zu der der Browser weitergeleitet wird. */
  async callback(
    workspace: Workspace,
    providerId: string,
    req: FastifyRequest,
    res: FastifyReply,
  ): Promise<string> {
    const sealed = req.cookies?.[SSO_STATE_COOKIE];
    res.clearCookie(SSO_STATE_COOKIE, { path: '/api/sso' });
    const st = sealed
      ? openState(sealed, this.environmentService.getAppSecret())
      : null;

    const failTo = (mode: SsoState['mode'] | undefined, message: string) => {
      const error = `ssoError=${encodeURIComponent(message)}`;
      if (mode === 'link') return `/settings/account/profile?${error}`;
      if (mode === 'join' && st?.joinCode) {
        return `/join?code=${encodeURIComponent(st.joinCode)}&${error}`;
      }
      return `/login?${error}`;
    };

    if (!st || st.providerId !== providerId) {
      return failTo(st?.mode, 'Sign-in expired. Please try again.');
    }

    const query = req.query as Record<string, string>;
    if (query.error || !query.code) {
      return failTo(st.mode, 'Sign-in was cancelled.');
    }
    if (query.state !== st.state) {
      return failTo(st.mode, 'Sign-in expired. Please try again.');
    }

    try {
      const provider = await this.providers.getEnabledConfig(workspace.id, providerId);
      const profile = await this.fetchProfile(provider, req, st);

      if (st.mode === 'link') {
        await this.linkToCurrentUser(req, workspace, provider, profile);
        return '/settings/account/profile?ssoLinked=1';
      }

      const user = await this.resolveUser(workspace, provider, profile, st);

      const mfa = await this.mfaService.startSecondFactor(user.id, workspace, res);
      const redirectQuery = `?redirect=${encodeURIComponent(st.redirect)}`;
      if (mfa?.userHasMfa) return `/login/mfa${redirectQuery}`;
      if (mfa?.requiresMfaSetup) return `/login/mfa/setup${redirectQuery}`;

      const authToken = await this.mfaService.createLoginSession(user, 'sso');
      res.setCookie('authToken', authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environmentService.getCookieExpiresIn(),
        secure: this.environmentService.isHttps(),
      });
      return st.redirect;
    } catch (err: any) {
      if (err instanceof SsoUserError || err instanceof BadRequestException) {
        return failTo(st.mode, err.message);
      }
      this.logger.warn(`SSO callback failed: ${err?.message ?? err}`);
      return failTo(st.mode, 'Sign-in with this provider failed.');
    }
  }

  // ------------------------------------------------------------ Konten

  async listLinkedAccounts(user: User, workspace: Workspace) {
    const rows = await this.db
      .selectFrom('authAccounts')
      .innerJoin('authProviders', 'authProviders.id', 'authAccounts.authProviderId')
      .select([
        'authProviders.id as providerId',
        'authProviders.name as providerName',
        'authAccounts.createdAt',
      ])
      .where('authAccounts.userId', '=', user.id)
      .where('authAccounts.workspaceId', '=', workspace.id)
      .execute();
    return { items: rows };
  }

  async unlink(user: User, workspace: Workspace, providerId: string) {
    const full = await this.userRepo.findById(user.id, workspace.id);
    const linked = await this.listLinkedAccounts(user, workspace);
    // Wer nie ein eigenes Passwort gesetzt hat, darf sich nicht aussperren.
    if (full?.hasGeneratedPassword && linked.items.length <= 1) {
      throw new BadRequestException(
        'Set a password first, otherwise you can no longer sign in.',
      );
    }
    await this.db
      .deleteFrom('authAccounts')
      .where('userId', '=', user.id)
      .where('workspaceId', '=', workspace.id)
      .where('authProviderId', '=', providerId)
      .execute();
  }

  // ------------------------------------------------------------ Intern

  private async getConfig(provider: SsoProviderConfig) {
    const key = `${provider.issuer}|${provider.clientId}|${provider.clientSecret}`;
    const cached = this.configCache.get(provider.id);
    if (cached && cached.key === key && Date.now() - cached.at < CONFIG_TTL_MS) {
      return cached.config;
    }
    if (!provider.issuer) throw new SsoUserError('Provider is not configured.');
    const issuerUrl = new URL(provider.issuer);
    const config = await oidc.discovery(
      issuerUrl,
      provider.clientId,
      provider.clientSecret,
      undefined,
      // Interne Anbieter (z. B. Authentik im Heimnetz) dürfen auch http nutzen.
      issuerUrl.protocol === 'http:'
        ? { execute: [oidc.allowInsecureRequests] }
        : undefined,
    );
    this.configCache.set(provider.id, { key, config, at: Date.now() });
    return config;
  }

  private async fetchProfile(
    provider: SsoProviderConfig,
    req: FastifyRequest,
    st: SsoState,
  ): Promise<SsoProfile> {
    const query = req.query as Record<string, string>;
    const redirectUri = this.providers.callbackUrl(provider.id);

    if (provider.preset === 'discord') {
      const tokenRes = await fetch(DISCORD.token, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: query.code,
          redirect_uri: redirectUri,
          client_id: provider.clientId,
          client_secret: provider.clientSecret,
        }),
      });
      if (!tokenRes.ok) throw new Error(`discord token ${tokenRes.status}`);
      const token = (await tokenRes.json()) as { access_token: string };
      const userRes = await fetch(DISCORD.user, {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      if (!userRes.ok) throw new Error(`discord user ${userRes.status}`);
      return profileFromDiscord(await userRes.json());
    }

    const config = await this.getConfig(provider);
    const currentUrl = new URL(redirectUri);
    for (const [k, v] of Object.entries(query)) currentUrl.searchParams.set(k, v);
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: st.codeVerifier,
      expectedState: st.state,
      expectedNonce: st.nonce,
      idTokenExpected: true,
    });
    let claims: Record<string, any> = { ...tokens.claims() };
    if (!claims.email || !claims.name) {
      try {
        const info = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
        claims = { ...info, ...claims, email: claims.email ?? info.email };
        if (claims.email_verified === undefined) claims.email_verified = info.email_verified;
      } catch {
        // UserInfo ist optional.
      }
    }
    return profileFromClaims(claims);
  }

  /** Findet das Konto zum SSO-Login, verknüpft es per E-Mail oder legt es an. */
  private async resolveUser(
    workspace: Workspace,
    provider: SsoProviderConfig,
    profile: SsoProfile,
    st: SsoState,
  ): Promise<User> {
    const account = await this.db
      .selectFrom('authAccounts')
      .select('userId')
      .where('authProviderId', '=', provider.id)
      .where('providerUserId', '=', profile.subject)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();

    if (account) {
      const user = await this.userRepo.findById(account.userId, workspace.id);
      if (!user || isUserDisabled(user)) {
        throw new SsoUserError('This account is deactivated.');
      }
      return user;
    }

    if (profile.email) {
      const existing = await this.userRepo.findByEmail(profile.email, workspace.id);
      if (existing) {
        if (!profile.emailVerified) {
          throw new SsoUserError(
            'An account with this email already exists. Sign in with your password and connect the provider in your profile.',
          );
        }
        if (isUserDisabled(existing)) {
          throw new SsoUserError('This account is deactivated.');
        }
        await this.insertLink(existing.id, workspace.id, provider.id, profile.subject);
        return existing;
      }
    }

    const viaJoinCode = st.mode === 'join' && !!st.joinCode;
    if (!viaJoinCode && !provider.allowSignup) {
      throw new SsoUserError(
        'No account found. Ask an admin for a join link or an invitation.',
      );
    }

    const email = profile.email ?? (await this.freePlaceholderEmail(workspace.id, profile));
    return executeTx(this.db, async (trx) => {
      const role = viaJoinCode
        ? await this.joinCodeService.consumeInTx(trx, workspace.id, st.joinCode)
        : null;
      const user = await this.signupService.signup(
        {
          name: (profile.name || email.split('@')[0]).slice(0, 50),
          email,
          password: randomBytes(32).toString('base64url'),
        },
        workspace.id,
        trx,
      );
      await trx
        .updateTable('users')
        .set({
          hasGeneratedPassword: true,
          ...(profile.emailVerified ? { emailVerifiedAt: new Date() } : {}),
          ...(role ? { role } : {}),
        })
        .where('id', '=', user.id)
        .execute();
      if (role) user.role = role as UserRole;
      await this.insertLink(user.id, workspace.id, provider.id, profile.subject, trx);
      return user;
    });
  }

  private async linkToCurrentUser(
    req: FastifyRequest,
    workspace: Workspace,
    provider: SsoProviderConfig,
    profile: SsoProfile,
  ) {
    const token = req.cookies?.authToken;
    let payload: { sub: string; workspaceId: string };
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.ACCESS);
    } catch {
      throw new SsoUserError('Please sign in again and retry.');
    }
    if (payload.workspaceId !== workspace.id) {
      throw new SsoUserError('Please sign in again and retry.');
    }

    const taken = await this.db
      .selectFrom('authAccounts')
      .select('userId')
      .where('authProviderId', '=', provider.id)
      .where('providerUserId', '=', profile.subject)
      .executeTakeFirst();
    if (taken && taken.userId !== payload.sub) {
      throw new SsoUserError('This account is already connected to another user.');
    }
    if (taken) return;

    await this.db
      .deleteFrom('authAccounts')
      .where('userId', '=', payload.sub)
      .where('authProviderId', '=', provider.id)
      .execute();
    await this.insertLink(payload.sub, workspace.id, provider.id, profile.subject);
  }

  private insertLink(
    userId: string,
    workspaceId: string,
    providerId: string,
    subject: string,
    trx?: any,
  ) {
    return (trx ?? this.db)
      .insertInto('authAccounts')
      .values({
        userId,
        workspaceId,
        authProviderId: providerId,
        providerUserId: subject,
      })
      .onConflict((oc) =>
        oc.columns(['userId', 'authProviderId']).doUpdateSet({
          providerUserId: subject,
          updatedAt: new Date(),
        }),
      )
      .execute();
  }

  private async freePlaceholderEmail(workspaceId: string, profile: SsoProfile) {
    const base = usernameBase(profile);
    for (let i = 0; i < 50; i++) {
      const candidate = placeholderEmail(i === 0 ? base : `${base}${i + 1}`);
      if (!(await this.userRepo.findByEmail(candidate, workspaceId))) return candidate;
    }
    return placeholderEmail(`${base}.${randomBytes(3).toString('hex')}`);
  }
}
