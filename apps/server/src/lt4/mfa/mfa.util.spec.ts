// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  buildTotp,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  validateTotp,
} from './mfa.util';

describe('mfa.util (LT4)', () => {
  it('verschlüsselt das Geheimnis und entschlüsselt es wieder', () => {
    const secret = generateTotpSecret();
    const stored = encryptSecret(secret, 'a'.repeat(32));
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored, 'a'.repeat(32))).toBe(secret);
    expect(() => decryptSecret(stored, 'b'.repeat(32))).toThrow();
  });

  it('akzeptiert aktuelle Codes und das Nachbarfenster, aber keine alten', () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 10, 24, 12, 0, 0);
    const totp = buildTotp(secret);
    const code = totp.generate({ timestamp: now });
    expect(validateTotp(secret, code, now)).toBe(Math.floor(now / 30000));
    expect(validateTotp(secret, code, now + 30_000)).not.toBeNull();
    expect(validateTotp(secret, code, now + 5 * 60_000)).toBeNull();
  });

  it('erzeugt 10 eindeutige Backup-Codes, Hash ignoriert Schreibweise', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(hashBackupCode(codes[0].toUpperCase().replace('-', ' '))).toBe(
      hashBackupCode(codes[0]),
    );
  });
});
