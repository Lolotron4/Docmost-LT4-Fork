// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { generateJoinCode, normalizeJoinCode } from './join-code.service';
import {
  isUsernameEmail,
  loginIdentifierToEmail,
  USERNAME_PATTERN,
  usernameToEmail,
} from './username';

describe('Beitrittslinks (LT4)', () => {
  it('Codes sind gut lesbar und werden beim Eintippen normalisiert', () => {
    const code = generateJoinCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeJoinCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
  });

  it('Benutzernamen werden zur Platzhalter-Adresse', () => {
    expect(usernameToEmail(' Max.Muster ')).toBe('max.muster@benutzer.invalid');
    expect(isUsernameEmail('max@benutzer.invalid')).toBe(true);
    expect(isUsernameEmail('max@schule.de')).toBe(false);
    expect(loginIdentifierToEmail('max')).toBe('max@benutzer.invalid');
    expect(loginIdentifierToEmail('max@schule.de')).toBe('max@schule.de');
  });

  it('erlaubte Benutzernamen', () => {
    for (const ok of ['max', 'max.muster', 'team_lead-2']) {
      expect(USERNAME_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ['ab', '.max', 'max.', 'max muster', 'mäx', 'a'.repeat(33)]) {
      expect(USERNAME_PATTERN.test(bad)).toBe(false);
    }
  });
});
