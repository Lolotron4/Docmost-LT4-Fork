// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Umwandlung zwischen SCIM-User-Objekten und dem, was LT4 speichert.
// Reine Funktionen ohne Datenbank, damit sie sich einfach testen lassen.
import { isUsernameEmail, normalizeUsername, USERNAME_EMAIL_DOMAIN } from '../accounts/username';
import { parseScimPatchPath, ScimFilterError } from './scim-filter';
import { SCIM_ENTERPRISE_USER, SCIM_USER, ScimError } from './scim.constants';

/** Was SCIM an einem Konto ändern kann. */
export interface ScimUserState {
  userName: string;
  externalId: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  /** Echte E-Mail-Adresse oder null (dann Konto mit Benutzername). */
  email: string | null;
  active: boolean;
  /** Nur gesetzt, wenn der Anbieter ein Passwort mitschickt. */
  password?: string;
}

export interface ScimUserRow {
  id: string;
  name: string | null;
  email: string;
  deactivatedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  scimExternalId: string | null;
  scimUserName: string | null;
  givenName: string | null;
  familyName: string | null;
}

export interface ScimGroupRef {
  id: string;
  name: string;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/** Entra schickt "True"/"False" als Text. */
export function toBool(v: unknown, fallback = true): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  if (typeof v === 'number') return v !== 0;
  return fallback;
}

const iso = (d: Date | string) => new Date(d).toISOString();

function isEmail(v: string | null | undefined): v is string {
  return !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Primäre (oder erste) E-Mail aus emails[]. */
function pickEmail(emails: unknown): string | null {
  if (!Array.isArray(emails) || emails.length === 0) return null;
  const list = emails.filter((e) => e && typeof e === 'object' && isEmail(str((e as any).value)));
  const primary = list.find((e: any) => toBool(e.primary, false)) ?? list.find((e: any) => str(e.type)?.toLowerCase() === 'work') ?? list[0];
  return primary ? str((primary as any).value) : null;
}

function key(obj: any, name: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return undefined;
}

/** SCIM-Objekt (POST/PUT) → Zustand. */
export function stateFromScimUser(body: any): ScimUserState {
  const userName = str(key(body, 'userName'));
  if (!userName) throw new ScimError(400, 'userName is required', 'invalidValue');
  const name = (key(body, 'name') ?? {}) as any;
  const password = str(key(body, 'password'));
  return {
    userName,
    externalId: str(key(body, 'externalId')),
    displayName: str(key(body, 'displayName')) ?? str(key(name, 'formatted')),
    givenName: str(key(name, 'givenName')),
    familyName: str(key(name, 'familyName')),
    email: pickEmail(key(body, 'emails')),
    active: toBool(key(body, 'active'), true),
    ...(password ? { password } : {}),
  };
}

/** Gespeichertes Konto → Zustand (Grundlage für PATCH). */
export function stateFromRow(row: ScimUserRow): ScimUserState {
  return {
    userName: userNameOf(row),
    externalId: row.scimExternalId,
    displayName: row.name,
    givenName: row.givenName,
    familyName: row.familyName,
    email: isUsernameEmail(row.email) ? null : row.email,
    active: !row.deactivatedAt,
  };
}

export function userNameOf(row: Pick<ScimUserRow, 'scimUserName' | 'email'>): string {
  if (row.scimUserName) return row.scimUserName;
  return isUsernameEmail(row.email) ? row.email.split('@')[0] : row.email;
}

/** Anzeigename aus dem, was der Anbieter schickt. */
export function displayNameOf(state: ScimUserState): string {
  const parts = [state.givenName, state.familyName].filter(Boolean).join(' ');
  return (state.displayName || parts || state.userName.split('@')[0]).slice(0, 100);
}

/**
 * Benutzername für Konten ohne E-Mail. Was LT4 als Benutzername nicht erlaubt
 * (Leerzeichen, Umlaute ...), wird ersetzt, damit die Anmeldung mit
 * Benutzername + Passwort weiter funktioniert.
 */
export function sanitizeUsername(userName: string): string {
  let u = normalizeUsername(userName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (u.length > 32) u = u.slice(0, 32).replace(/[^a-z0-9]+$/, '');
  while (u.length < 3) u += '0';
  return u;
}

/**
 * Interne E-Mail-Adresse für den Zustand: echte E-Mail, sonst userName (wenn
 * er wie eine E-Mail aussieht), sonst Platzhalter für ein Konto mit Benutzername.
 */
export function emailFor(state: ScimUserState): string {
  if (isEmail(state.email)) return state.email.toLowerCase();
  if (isEmail(state.userName) && !state.userName.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`)) {
    return state.userName.toLowerCase();
  }
  return `${sanitizeUsername(state.userName.split('@')[0])}@${USERNAME_EMAIL_DOMAIN}`;
}

export function toScimUser(row: ScimUserRow, groups: ScimGroupRef[], baseUrl: string) {
  const location = `${baseUrl}/Users/${row.id}`;
  const name: Record<string, string> = {};
  if (row.name) name.formatted = row.name;
  if (row.givenName) name.givenName = row.givenName;
  if (row.familyName) name.familyName = row.familyName;
  return {
    schemas: [SCIM_USER],
    id: row.id,
    ...(row.scimExternalId ? { externalId: row.scimExternalId } : {}),
    userName: userNameOf(row),
    name,
    displayName: row.name ?? userNameOf(row),
    active: !row.deactivatedAt,
    emails: isUsernameEmail(row.email) ? [] : [{ value: row.email, type: 'work', primary: true }],
    groups: groups.map((g) => ({ value: g.id, display: g.name, $ref: `${baseUrl}/Groups/${g.id}`, type: 'direct' })),
    meta: {
      resourceType: 'User',
      created: iso(row.createdAt),
      lastModified: iso(row.updatedAt),
      location,
    },
  };
}

// ------------------------------------------------------------------ PATCH

export interface ScimPatchOp {
  op: string;
  path?: string;
  value?: unknown;
}

export function readPatchOps(body: any): ScimPatchOp[] {
  const ops = key(body, 'Operations');
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new ScimError(400, 'Operations are required', 'invalidSyntax');
  }
  return ops.map((o: any) => {
    const op = str(key(o, 'op'))?.toLowerCase();
    if (op !== 'add' && op !== 'replace' && op !== 'remove') {
      throw new ScimError(400, `Unsupported patch operation "${key(o, 'op')}"`, 'invalidSyntax');
    }
    return { op, path: str(key(o, 'path')) ?? undefined, value: key(o, 'value') };
  });
}

/** Wert eines einzelnen Attributs setzen (oder bei remove löschen). */
function applyUserAttr(state: ScimUserState, path: string, value: unknown, remove: boolean) {
  let parsed;
  try {
    parsed = parseScimPatchPath(path);
  } catch (err) {
    if (err instanceof ScimFilterError) throw new ScimError(400, err.message, 'invalidPath');
    throw err;
  }
  const { attr, sub } = parsed;
  // Erweiterungen (z. B. Abteilung aus dem Enterprise-Schema) ignorieren wir
  if (path.toLowerCase().startsWith(SCIM_ENTERPRISE_USER.toLowerCase())) return;

  switch (attr) {
    case 'username':
      if (remove || !str(value)) throw new ScimError(400, 'userName cannot be removed', 'mutability');
      state.userName = str(value);
      return;
    case 'externalid':
      state.externalId = remove ? null : str(value);
      return;
    case 'displayname':
      state.displayName = remove ? null : str(value);
      return;
    case 'active':
      state.active = remove ? true : toBool(value, state.active);
      return;
    case 'password':
      if (!remove && str(value)) state.password = str(value);
      return;
    case 'name': {
      if (!sub) {
        const v = (remove ? {} : value ?? {}) as any;
        state.givenName = str(key(v, 'givenName'));
        state.familyName = str(key(v, 'familyName'));
        if (str(key(v, 'formatted'))) state.displayName = str(key(v, 'formatted'));
        return;
      }
      if (sub === 'givenname') state.givenName = remove ? null : str(value);
      else if (sub === 'familyname') state.familyName = remove ? null : str(value);
      else if (sub === 'formatted') state.displayName = remove ? null : str(value);
      return;
    }
    case 'emails': {
      if (remove) {
        state.email = null;
        return;
      }
      if (sub === 'value' || parsed.filter) {
        const v = sub ? str(value) : pickEmail(Array.isArray(value) ? value : [value]);
        if (isEmail(v)) state.email = v;
        return;
      }
      const v = pickEmail(Array.isArray(value) ? value : [value]);
      if (v) state.email = v;
      return;
    }
    default:
      // Unbekannte/nicht gespeicherte Attribute (phoneNumbers, title ...) still ignorieren
      return;
  }
}

/** Wendet PATCH-Operationen auf den Zustand an (RFC 7644, Abschnitt 3.5.2). */
export function applyUserPatch(current: ScimUserState, ops: ScimPatchOp[]): ScimUserState {
  const state: ScimUserState = { ...current };
  for (const op of ops) {
    const remove = op.op === 'remove';
    if (op.path) {
      applyUserAttr(state, op.path, op.value, remove);
      continue;
    }
    if (remove) throw new ScimError(400, 'Remove needs a path', 'noTarget');
    if (!op.value || typeof op.value !== 'object' || Array.isArray(op.value)) {
      throw new ScimError(400, 'Patch value must be an object', 'invalidValue');
    }
    // Ohne Pfad: { active: false } oder { "name.givenName": "Max", "emails[type eq \"work\"].value": "..." }
    for (const [k, v] of Object.entries(op.value as Record<string, unknown>)) {
      if (k.toLowerCase() === SCIM_ENTERPRISE_USER.toLowerCase()) continue;
      if (k.toLowerCase() === 'schemas' || k.toLowerCase() === 'id' || k.toLowerCase() === 'meta') continue;
      applyUserAttr(state, k, v, false);
    }
  }
  return state;
}
