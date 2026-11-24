// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
} from 'node:crypto';
import * as OTPAuth from 'otpauth';

export const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const SECRET_PREFIX = 'lt4:v1:';
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const BACKUP_CODE_COUNT = 10;

function keyFrom(appSecret: string) {
  return createHash('sha256').update(`${appSecret}:lt4-mfa`).digest();
}

/** Speichert das TOTP-Geheimnis verschlüsselt (AES-256-GCM, Schlüssel aus APP_SECRET). */
export function encryptSecret(secret: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(appSecret), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return SECRET_PREFIX + Buffer.concat([iv, tag, data]).toString('base64');
}

export function decryptSecret(stored: string, appSecret: string): string {
  if (!stored.startsWith(SECRET_PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(SECRET_PREFIX.length), 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(appSecret),
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildTotp(secret: string, label = '', issuer = 'Docmost') {
  return new OTPAuth.TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * Prüft einen 6-stelligen Code (±1 Zeitfenster) und gibt den Zähler des
 * passenden Zeitfensters zurück, sonst null.
 */
export function validateTotp(
  secret: string,
  token: string,
  now = Date.now(),
): number | null {
  const delta = buildTotp(secret).validate({
    token,
    timestamp: now,
    window: 1,
  });
  if (delta === null) return null;
  return Math.floor(now / 1000 / TOTP_PERIOD) + delta;
}

export function normalizeCode(code: string): string {
  return (code ?? '').replace(/[\s-]/g, '').toLowerCase();
}

export function isTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normalizeCode(code)).digest('hex');
}

/** Erzeugt Backup-Codes im Format "abcde-fghjk" (ohne verwechselbare Zeichen). */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const part = () =>
    Array.from(
      { length: 5 },
      () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)],
    ).join('');
  return Array.from({ length: count }, () => `${part()}-${part()}`);
}
