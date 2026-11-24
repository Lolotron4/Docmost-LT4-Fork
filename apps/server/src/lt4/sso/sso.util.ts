// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { createHash } from 'node:crypto';
import { decryptSecret, encryptSecret } from '../mfa/mfa.util';
import { USERNAME_EMAIL_DOMAIN } from '../accounts/username';

export type SsoPreset = 'oidc' | 'google' | 'microsoft' | 'discord';
export const SSO_PRESETS: SsoPreset[] = ['oidc', 'google', 'microsoft', 'discord'];

export const DISCORD = {
  authorize: 'https://discord.com/oauth2/authorize',
  token: 'https://discord.com/api/oauth2/token',
  user: 'https://discord.com/api/users/@me',
};

/** Aussteller-URL je Vorlage. Microsoft braucht die Tenant-ID (oder "common"). */
export function issuerFor(preset: SsoPreset, issuer?: string, tenant?: string) {
  if (preset === 'google') return 'https://accounts.google.com';
  if (preset === 'microsoft') {
    return `https://login.microsoftonline.com/${tenant || 'common'}/v2.0`;
  }
  if (preset === 'discord') return null;
  return issuer?.trim().replace(/\/+$/, '') || null;
}

export type SsoProfile = {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  username: string | null;
};

/** Discord-Antwort von /users/@me in ein einheitliches Profil übersetzen. */
export function profileFromDiscord(user: any): SsoProfile {
  return {
    subject: String(user.id),
    email: user.email ?? null,
    emailVerified: user.verified === true && !!user.email,
    name: user.global_name || user.username || null,
    username: user.username ?? null,
  };
}

/** OIDC-Claims (ID-Token / UserInfo) in ein einheitliches Profil übersetzen. */
export function profileFromClaims(claims: Record<string, any>): SsoProfile {
  const email = claims.email ?? null;
  return {
    subject: String(claims.sub),
    email,
    // Ohne ausdrückliches email_verified wird nie per E-Mail verknüpft.
    emailVerified: claims.email_verified === true && !!email,
    name:
      claims.name ||
      [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
      claims.preferred_username ||
      null,
    username: claims.preferred_username ?? claims.nickname ?? null,
  };
}

/** Benutzername-Basis für Konten ohne E-Mail ("Max_Muster!" → "max_muster"). */
export function usernameBase(profile: SsoProfile): string {
  const raw = (profile.username || profile.name || 'user')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 28);
  return raw.length >= 3 ? raw : `user.${raw || 'sso'}`;
}

export function placeholderEmail(username: string) {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

/** Nur relative Pfade innerhalb der App sind als Ziel nach dem Login erlaubt. */
export function safeRedirect(path?: string | null): string {
  if (!path || typeof path !== 'string') return '/home';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/home';
  }
  return path.slice(0, 1000);
}

// --- Zustand zwischen Start und Rückkehr (verschlüsseltes Cookie) ---

export const SSO_STATE_COOKIE = 'lt4SsoState';
const STATE_TTL_MS = 10 * 60 * 1000;

export type SsoState = {
  providerId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  mode: 'login' | 'join' | 'link';
  redirect: string;
  joinCode?: string;
  exp: number;
};

export function sealState(data: Omit<SsoState, 'exp'>, appSecret: string) {
  return encryptSecret(
    JSON.stringify({ ...data, exp: Date.now() + STATE_TTL_MS }),
    `${appSecret}:sso-state`,
  );
}

export function openState(sealed: string, appSecret: string): SsoState | null {
  try {
    const data = JSON.parse(
      decryptSecret(sealed, `${appSecret}:sso-state`),
    ) as SsoState;
    if (!data?.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function encryptClientSecret(secret: string, appSecret: string) {
  return encryptSecret(secret, `${appSecret}:sso-client`);
}

export function decryptClientSecret(stored: string, appSecret: string) {
  return decryptSecret(stored, `${appSecret}:sso-client`);
}

export function hashForLog(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}
