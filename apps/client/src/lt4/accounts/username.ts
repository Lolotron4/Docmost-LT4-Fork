// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Konten mit Benutzername haben intern eine Platzhalter-Adresse (siehe Server: lt4/accounts/username.ts).
export const USERNAME_EMAIL_DOMAIN = "benutzer.invalid";
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;

export function isUsernameEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

/** Zeigt statt der Platzhalter-Adresse den Benutzernamen an ("@max.muster"). */
export function displayEmail(email?: string | null): string {
  if (!email) return "";
  return isUsernameEmail(email) ? `@${email.split("@")[0]}` : email;
}
