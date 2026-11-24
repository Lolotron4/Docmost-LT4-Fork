// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Konten ohne E-Mail: Docmost verlangt intern eine E-Mail-Adresse. Konten mit
 * Benutzername bekommen deshalb eine Platzhalter-Adresse unter der reservierten
 * Domain ".invalid" (RFC 2606), an die nie Post geht.
 */
export const USERNAME_EMAIL_DOMAIN = 'benutzer.invalid';
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;

export function normalizeUsername(username: string): string {
  return (username ?? '').trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`;
}

export function isUsernameEmail(email: string): boolean {
  return (email ?? '').toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

/** Login-Feld: "max.muster" wird zur Platzhalter-Adresse, echte Adressen bleiben. */
export function loginIdentifierToEmail(identifier: string): string {
  const value = (identifier ?? '').trim();
  return value.includes('@') ? value : usernameToEmail(value);
}
