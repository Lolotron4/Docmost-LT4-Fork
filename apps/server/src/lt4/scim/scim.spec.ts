// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { matchesScimFilter, parseScimFilter, parseScimPatchPath } from './scim-filter';
import { applyUserPatch, emailFor, readPatchOps, sanitizeUsername, stateFromScimUser } from './scim-users';

const user = {
  userName: 'Max@Schule.de',
  externalId: 'abc',
  active: true,
  emails: [
    { value: 'privat@example.org', type: 'home' },
    { value: 'max@schule.de', type: 'work', primary: true },
  ],
};

describe('SCIM-Filter', () => {
  const m = (f: string, r: any = user) => matchesScimFilter(r, parseScimFilter(f));

  it('vergleicht ohne Groß-/Kleinschreibung', () => {
    expect(m('userName eq "max@schule.de"')).toBe(true);
    expect(m('userName eq "moritz@schule.de"')).toBe(false);
  });
  it('kann and/or/not und Klammern', () => {
    expect(m('externalId eq "abc" and active eq true')).toBe(true);
    expect(m('externalId eq "x" or (userName sw "max" and not (active eq false))')).toBe(true);
  });
  it('kann Wertpfade', () => {
    expect(m('emails[type eq "work"].value eq "max@schule.de"')).toBe(true);
    expect(m('emails[type eq "home" and value co "schule"]')).toBe(false);
    expect(m('emails.value eq "privat@example.org"')).toBe(true);
  });
  it('kann Schema-URNs und pr', () => {
    expect(m('urn:ietf:params:scim:schemas:core:2.0:User:userName eq "MAX@schule.de"')).toBe(true);
    expect(m('title pr')).toBe(false);
  });
  it('meldet kaputte Filter', () => {
    expect(() => parseScimFilter('userName eq')).toThrow();
    expect(() => parseScimFilter('userName foo "x"')).toThrow();
  });
});

describe('SCIM-Konten', () => {
  it('nimmt die primäre E-Mail', () => {
    const s = stateFromScimUser(user);
    expect(s.email).toBe('max@schule.de');
    expect(emailFor(s)).toBe('max@schule.de');
  });
  it('legt ohne E-Mail ein Konto mit Benutzername an', () => {
    const s = stateFromScimUser({ userName: 'Jürgen Müller' });
    expect(emailFor(s)).toBe('jurgen.muller@benutzer.invalid');
    expect(sanitizeUsername('a')).toBe('a00');
  });
  it('versteht PATCH im Entra-Stil', () => {
    const s = stateFromScimUser(user);
    const ops = readPatchOps({
      Operations: [
        { op: 'Replace', path: 'active', value: 'False' },
        { op: 'Replace', path: 'emails[type eq "work"].value', value: 'neu@schule.de' },
        { op: 'Add', value: { 'name.givenName': 'Max', displayName: 'Max M.' } },
        { op: 'Replace', path: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department', value: 'IT' },
      ],
    });
    const next = applyUserPatch(s, ops);
    expect(next.active).toBe(false);
    expect(next.email).toBe('neu@schule.de');
    expect(next.givenName).toBe('Max');
    expect(next.displayName).toBe('Max M.');
  });
  it('zerlegt PATCH-Pfade', () => {
    expect(parseScimPatchPath('members[value eq "x"]').attr).toBe('members');
    expect(parseScimPatchPath('name.givenName')).toEqual({ attr: 'name', sub: 'givenname' });
  });
});
