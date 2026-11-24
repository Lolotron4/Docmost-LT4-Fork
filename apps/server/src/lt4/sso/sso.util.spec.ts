// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  issuerFor,
  openState,
  profileFromClaims,
  profileFromDiscord,
  safeRedirect,
  sealState,
  usernameBase,
} from './sso.util';

const SECRET = 's'.repeat(40);

describe('SSO-Hilfen (LT4)', () => {
  it('Aussteller je Vorlage', () => {
    expect(issuerFor('google')).toBe('https://accounts.google.com');
    expect(issuerFor('microsoft', undefined, 'abc')).toBe(
      'https://login.microsoftonline.com/abc/v2.0',
    );
    expect(issuerFor('microsoft')).toContain('/common/');
    expect(issuerFor('oidc', 'https://auth.example.org/application/o/docmost/')).toBe(
      'https://auth.example.org/application/o/docmost',
    );
    expect(issuerFor('discord')).toBeNull();
  });

  it('E-Mail gilt nur mit ausdrücklichem email_verified als bestätigt', () => {
    expect(profileFromClaims({ sub: '1', email: 'a@b.de' }).emailVerified).toBe(false);
    expect(
      profileFromClaims({ sub: '1', email: 'a@b.de', email_verified: true }).emailVerified,
    ).toBe(true);
    expect(profileFromClaims({ sub: '1', given_name: 'Max', family_name: 'M' }).name).toBe(
      'Max M',
    );
  });

  it('Discord-Profil', () => {
    const p = profileFromDiscord({ id: 42, username: 'steve', global_name: 'Steve', email: 's@x.de', verified: true });
    expect(p).toEqual({ subject: '42', email: 's@x.de', emailVerified: true, name: 'Steve', username: 'steve' });
    expect(profileFromDiscord({ id: 1, username: 'x', verified: false, email: 'x@y.de' }).emailVerified).toBe(false);
  });

  it('Benutzername ohne E-Mail', () => {
    expect(usernameBase({ subject: '1', email: null, emailVerified: false, name: 'Jürgen Groß', username: null })).toBe('jurgen.gro');
    expect(usernameBase({ subject: '1', email: null, emailVerified: false, name: null, username: 'Steve_99' })).toBe('steve_99');
    expect(usernameBase({ subject: '1', email: null, emailVerified: false, name: 'X', username: null })).toBe('user.x');
  });

  it('nur interne Weiterleitungen', () => {
    expect(safeRedirect('/s/abc')).toBe('/s/abc');
    expect(safeRedirect('//evil.com')).toBe('/home');
    expect(safeRedirect('https://evil.com')).toBe('/home');
    expect(safeRedirect('/\\evil.com')).toBe('/home');
    expect(safeRedirect(undefined)).toBe('/home');
  });

  it('Zustand ist verschlüsselt, fälschungssicher und läuft ab', () => {
    const sealed = sealState(
      { providerId: 'p', state: 's', nonce: 'n', codeVerifier: 'v', mode: 'login', redirect: '/home' },
      SECRET,
    );
    expect(sealed).not.toContain('codeVerifier');
    expect(openState(sealed, SECRET)?.providerId).toBe('p');
    expect(openState(sealed, 'x'.repeat(40))).toBeNull();
    expect(openState(sealed.slice(0, -4) + 'AAAA', SECRET)).toBeNull();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
    expect(openState(sealed, SECRET)).toBeNull();
    jest.restoreAllMocks();
  });
});
