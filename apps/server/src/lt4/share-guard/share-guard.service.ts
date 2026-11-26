// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Gastlinks: öffentliche Freigaben (shares) mit Ablaufdatum und Passwort.
//
// Die Einstellungen liegen in lt4_share_settings (eine Zeile pro Freigabe,
// fehlt sie, gilt die Freigabe unbegrenzt und ohne Passwort wie im Kern).
// Alle öffentlichen Freigabe-Endpunkte rufen assertAccess() auf, nachdem sie
// die Freigabe ermittelt haben. Unterseiten erben dabei die Regeln der
// Freigabe, über die sie erreichbar sind.
//
// Nach Eingabe des Passworts bekommt der Browser ein Cookie pro Freigabe
// (HMAC über Freigabe, Passwort-Hash und Ablaufzeit). Ein neues Passwort
// macht alte Cookies ungültig.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { comparePasswordHash, hashPassword } from '../../common/helpers/utils';
import { hasPermission } from '../roles/role-store';

export type ShareLinkPolicy = {
  /** Neue Gastlinks brauchen ein Ablaufdatum */
  requireExpiry: boolean;
  /** Höchstdauer in Tagen (null = keine Grenze) */
  maxDays: number | null;
  /** Neue Gastlinks brauchen ein Passwort */
  requirePassword: boolean;
};

export const DEFAULT_SHARE_LINK_POLICY: ShareLinkPolicy = {
  requireExpiry: false,
  maxDays: null,
  requirePassword: false,
};

export function normalizeShareLinkPolicy(raw: any): ShareLinkPolicy {
  const p = { ...DEFAULT_SHARE_LINK_POLICY, ...(raw ?? {}) };
  const days = Number(p.maxDays);
  return {
    requireExpiry: !!p.requireExpiry,
    maxDays: Number.isFinite(days) && days >= 1 ? Math.min(3650, Math.floor(days)) : null,
    requirePassword: !!p.requirePassword,
  };
}

export type ShareSettings = {
  expiresAt: Date | null;
  passwordHash: string | null;
};

/** Fehlercodes im Antworttext, damit die öffentliche Seite reagieren kann. */
export const SHARE_PASSWORD_REQUIRED = 'LT4_SHARE_PASSWORD_REQUIRED';
export const SHARE_EXPIRED = 'LT4_SHARE_EXPIRED';

export const MIN_SHARE_PASSWORD_LENGTH = 4;
const COOKIE_PREFIX = 'lt4share_';
const UNLOCK_HOURS = 12;

type ShareRef = { id: string; workspaceId?: string | null };

@Injectable()
export class ShareGuardService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
  ) {}

  // ------------------------------------------------------------ Lesen

  async getSettings(shareId: string): Promise<ShareSettings | null> {
    const row = await this.db
      .selectFrom('lt4ShareSettings')
      .select(['expiresAt', 'passwordHash'])
      .where('shareId', '=', shareId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      expiresAt: row.expiresAt ? new Date(row.expiresAt as any) : null,
      passwordHash: row.passwordHash ?? null,
    };
  }

  /** Öffentliche Sicht auf die Einstellungen (ohne Hash). */
  async getPublicSettings(shareId: string) {
    const s = await this.getSettings(shareId);
    return {
      expiresAt: s?.expiresAt ? s.expiresAt.toISOString() : null,
      hasPassword: !!s?.passwordHash,
      expired: isExpired(s),
    };
  }

  // ------------------------------------------------------------ Zugriff

  /**
   * Wirft, wenn die Freigabe abgelaufen ist (410) oder ein Passwort braucht,
   * das dieser Browser noch nicht eingegeben hat (403).
   */
  async assertAccess(share: ShareRef | null | undefined, req: FastifyRequest | null) {
    if (!share?.id) return;
    const s = await this.getSettings(share.id);
    if (!s) return;
    if (isExpired(s)) {
      throw new HttpException(
        { statusCode: 410, message: 'This link has expired', error: SHARE_EXPIRED, shareId: share.id },
        HttpStatus.GONE,
      );
    }
    if (s.passwordHash && !this.hasValidCookie(share.id, s.passwordHash, req)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'This link is password protected',
        error: SHARE_PASSWORD_REQUIRED,
        shareId: share.id,
      });
    }
  }

  /** Wie assertAccess, aber als Ja/Nein (z. B. für Meta-Tags). */
  async canAccess(share: ShareRef | null | undefined, req: FastifyRequest | null) {
    try {
      await this.assertAccess(share, req);
      return true;
    } catch {
      return false;
    }
  }

  async unlock(shareId: string, password: string, res: FastifyReply) {
    const s = await this.getSettings(shareId);
    if (!s || isExpired(s)) {
      throw new HttpException(
        { statusCode: 410, message: 'This link has expired', error: SHARE_EXPIRED, shareId },
        HttpStatus.GONE,
      );
    }
    if (!s.passwordHash) return { ok: true };
    const ok = await comparePasswordHash(password ?? '', s.passwordHash);
    if (!ok) throw new BadRequestException('Wrong password');

    let exp = Date.now() + UNLOCK_HOURS * 3600_000;
    if (s.expiresAt) exp = Math.min(exp, s.expiresAt.getTime());
    res.setCookie(COOKIE_PREFIX + shareId, `${exp}.${this.sign(shareId, s.passwordHash, exp)}`, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(exp),
      secure: this.environmentService.isHttps(),
    });
    return { ok: true };
  }

  private hasValidCookie(shareId: string, passwordHash: string, req: FastifyRequest | null) {
    const raw = (req as any)?.cookies?.[COOKIE_PREFIX + shareId];
    if (!raw || typeof raw !== 'string') return false;
    const dot = raw.indexOf('.');
    if (dot < 1) return false;
    const exp = Number(raw.slice(0, dot));
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const expected = Buffer.from(this.sign(shareId, passwordHash, exp));
    const given = Buffer.from(raw.slice(dot + 1));
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private sign(shareId: string, passwordHash: string, exp: number) {
    return createHmac('sha256', this.environmentService.getAppSecret())
      .update(`lt4-share:${shareId}:${passwordHash}:${exp}`)
      .digest('base64url');
  }

  // ------------------------------------------------------------ Regeln

  async getPolicy(workspaceId: string): Promise<ShareLinkPolicy> {
    const ws = await this.db
      .selectFrom('workspaces')
      .select('settings')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    return normalizeShareLinkPolicy((ws?.settings as any)?.security?.shareLinks);
  }

  async savePolicy(workspaceId: string, raw: any): Promise<ShareLinkPolicy> {
    const policy = normalizeShareLinkPolicy(raw);
    await this.db
      .updateTable('workspaces')
      .set({
        settings: sql`jsonb_set(coalesce(settings, '{}'::jsonb), '{security}', coalesce(settings->'security', '{}'::jsonb) || jsonb_build_object('shareLinks', ${JSON.stringify(policy)}::text::jsonb))`,
      })
      .where('id', '=', workspaceId)
      .execute();
    return policy;
  }

  canBypassPolicy(user: User) {
    return hasPermission(user, 'shares_unrestricted');
  }

  /**
   * Prüft die gewünschten Einstellungen gegen die Regeln des Workspace.
   * Wer das Rollenrecht "shares_unrestricted" hat, ist davon ausgenommen.
   */
  async validateAgainstPolicy(
    user: User,
    next: { expiresAt: Date | null; hasPassword: boolean },
    opts: { checkFuture?: boolean } = { checkFuture: true },
  ) {
    if (opts.checkFuture !== false && next.expiresAt && next.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('The expiry date must be in the future');
    }
    if (this.canBypassPolicy(user)) return;
    const policy = await this.getPolicy(user.workspaceId);
    if (policy.requirePassword && !next.hasPassword) {
      throw new BadRequestException('Public links need a password in this workspace');
    }
    if ((policy.requireExpiry || policy.maxDays) && !next.expiresAt) {
      throw new BadRequestException('Public links need an expiry date in this workspace');
    }
    if (policy.maxDays && next.expiresAt && opts.checkFuture !== false) {
      // eine Stunde Kulanz für Zeitzonen und Datumsauswahl
      const max = Date.now() + policy.maxDays * 86400_000 + 3600_000;
      if (next.expiresAt.getTime() > max) {
        throw new BadRequestException(
          `Public links can be valid for at most ${policy.maxDays} days in this workspace`,
        );
      }
    }
  }

  // ------------------------------------------------------------ Schreiben

  /**
   * Ändert Ablauf und/oder Passwort. Felder, die undefined sind, bleiben.
   * password = '' oder null entfernt das Passwort.
   */
  async update(
    user: User,
    share: { id: string; workspaceId: string },
    changes: { expiresAt?: string | null; password?: string | null },
  ) {
    const current = await this.getSettings(share.id);
    let expiresAt = current?.expiresAt ?? null;
    let passwordHash = current?.passwordHash ?? null;

    if (changes.expiresAt !== undefined) {
      expiresAt = parseDate(changes.expiresAt);
    }
    let newPassword: string | null | undefined = undefined;
    if (changes.password !== undefined) {
      newPassword = changes.password ? String(changes.password) : null;
      assertSharePassword(newPassword);
    }

    const hasPassword = newPassword === undefined ? !!passwordHash : !!newPassword;
    await this.validateAgainstPolicy(
      user,
      { expiresAt, hasPassword },
      { checkFuture: changes.expiresAt !== undefined },
    );

    if (newPassword !== undefined) {
      passwordHash = newPassword ? await hashPassword(newPassword) : null;
    }

    await this.db
      .insertInto('lt4ShareSettings')
      .values({
        shareId: share.id,
        workspaceId: share.workspaceId,
        expiresAt,
        passwordHash,
      })
      .onConflict((oc) =>
        oc.column('shareId').doUpdateSet({
          expiresAt,
          passwordHash,
          updatedAt: sql`now()`,
        }),
      )
      .execute();

    return this.getPublicSettings(share.id);
  }
}

/** Prüft Länge eines neuen Passworts (null = kein Passwort, erlaubt). */
export function assertSharePassword(password: string | null | undefined) {
  if (!password) return;
  if (password.length < MIN_SHARE_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `The password must be at least ${MIN_SHARE_PASSWORD_LENGTH} characters long`,
    );
  }
  if (password.length > 200) {
    throw new BadRequestException('The password is too long');
  }
}

function isExpired(s: ShareSettings | null | undefined) {
  return !!s?.expiresAt && s.expiresAt.getTime() <= Date.now();
}

export function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid expiry date');
  return d;
}
