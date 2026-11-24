// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.

export type LdapAttributeMap = {
  /** Attribut mit dem Anmeldenamen, z. B. uid oder sAMAccountName. */
  username: string;
  email: string;
  name: string;
};

export const DEFAULT_LDAP_ATTRIBUTES: LdapAttributeMap = {
  username: 'uid',
  email: 'mail',
  name: 'cn',
};

/** Platzhalter {{username}} wird durch den (maskierten) Anmeldenamen ersetzt. */
export const DEFAULT_LDAP_FILTER = '(|(uid={{username}})(mail={{username}}))';

/** Maskiert einen Wert für LDAP-Suchfilter (RFC 4515). */
export function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\\*()\u0000]/g, (c) =>
    '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'),
  );
}

export function buildLdapFilter(template: string | null | undefined, username: string) {
  const tpl = (template || DEFAULT_LDAP_FILTER).trim();
  const safe = escapeLdapFilterValue(username);
  const filter = tpl.split('{{username}}').join(safe);
  return filter.startsWith('(') ? filter : `(${filter})`;
}

export function firstValue(v: unknown): string | null {
  if (Array.isArray(v)) v = v[0];
  if (Buffer.isBuffer(v)) v = v.toString('utf8');
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

/** Eindeutige ID eines Eintrags: entryUUID / objectGUID, sonst der DN. */
export function ldapSubject(entry: Record<string, any>): string {
  const uuid = firstValue(entry.entryUUID);
  if (uuid) return `uuid:${uuid.toLowerCase()}`;
  const guid = entry.objectGUID;
  if (Buffer.isBuffer(guid)) return `guid:${guid.toString('hex')}`;
  return `dn:${String(entry.dn).toLowerCase()}`;
}

export function isLdapUrl(url: string) {
  return /^ldaps?:\/\/[^\s/]+(:\d+)?\/?$/i.test(url.trim());
}
