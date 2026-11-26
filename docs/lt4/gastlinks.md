# Gastlinks: öffentliche Links mit Ablaufdatum und Passwort (LT4 v1.4.0)

LT4 erweitert das öffentliche Teilen aus dem Docmost-Kern ("Teilen" > "Im Web teilen").
Für jeden öffentlichen Link kann man jetzt festlegen:

- **Link läuft ab**: nie, in 1/7/30/90 Tagen oder an einem frei gewählten Datum mit Uhrzeit.
  Danach sehen Gäste "Dieser Link ist abgelaufen". Der Link bleibt bestehen und kann
  verlängert werden.
- **Passwort**: Gäste müssen es einmal eingeben. Der Browser merkt sich das für 12 Stunden
  (höchstens bis zum Ablauf des Links). Ein neues Passwort sperrt alle, die nur das alte kannten.

Unterseiten, die über "Unterseiten einbeziehen" erreichbar sind, haben dieselben Regeln wie der Link.

Ändern dürfen das alle, die die Seite bearbeiten dürfen (wie beim Kern-Teilen).
Jede Änderung steht im Audit-Log ("Ablauf oder Passwort eines öffentlichen Links geändert").

## Regeln für den Workspace

Unter **Einstellungen > Sicherheit > Öffentliche Links** (Recht "Einstellungen verwalten"):

- Öffentliche Links brauchen ein Ablaufdatum
- Höchstens gültig (Tage), leer = keine Grenze
- Öffentliche Links brauchen ein Passwort

Die Regeln gelten für neue Links und für Änderungen. Bestehende Links bleiben, wie sie sind.

## Rollenrecht

**Öffentliche Links ohne Einschränkung** (`shares_unrestricted`): Wer es hat, ist von den
Regeln oben ausgenommen. Owner haben es immer, Admin standardmäßig; Rollen, die
"Einstellungen verwalten" hatten, bekommen es per Migration dazu.

## Technik

- Tabelle `lt4_share_settings` (eine Zeile pro Freigabe, `expires_at`, `password_hash` mit bcrypt).
- Alle öffentlichen Freigabe-Endpunkte (`/api/shares/page-info`, `/info`, `/tree`,
  `/transclusion/lookup`, `/api/search/share-search`, Meta-Tags unter `/share/...`) prüfen den
  Link über `ShareGuardService.assertAccess`: 410 mit `LT4_SHARE_EXPIRED` oder 403 mit
  `LT4_SHARE_PASSWORD_REQUIRED`.
- `POST /api/lt4-shares/unlock` (gedrosselt, 10 Versuche pro Minute) setzt ein HttpOnly-Cookie
  `lt4share_<id>` mit HMAC über Freigabe, Passwort-Hash und Ablaufzeit (APP_SECRET).
- Geschützte Links verraten in Vorschauen (Meta-Tags) keinen Seitentitel.
