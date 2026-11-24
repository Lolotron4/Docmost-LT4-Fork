// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { buildLdapFilter, escapeLdapFilterValue, ldapSubject } from './ldap.util';

describe('ldap.util', () => {
  it('maskiert Sonderzeichen im Suchfilter', () => {
    expect(escapeLdapFilterValue('a*(b)\\c')).toBe('a\\2a\\28b\\29\\5cc');
    expect(escapeLdapFilterValue('x\u0000')).toBe('x\\00');
  });

  it('setzt den Namen in den Filter ein', () => {
    expect(buildLdapFilter('(uid={{username}})', 'jonas')).toBe('(uid=jonas)');
    expect(buildLdapFilter(null, '*')).toBe('(|(uid=\\2a)(mail=\\2a))');
    expect(buildLdapFilter('sAMAccountName={{username}}', 'max')).toBe('(sAMAccountName=max)');
  });

  it('nimmt entryUUID vor dem DN', () => {
    expect(ldapSubject({ dn: 'uid=a,dc=x', entryUUID: 'ABC' })).toBe('uuid:abc');
    expect(ldapSubject({ dn: 'UID=a,DC=x' })).toBe('dn:uid=a,dc=x');
  });
});
