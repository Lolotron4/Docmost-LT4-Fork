# SCIM-Abgleich (SCIM 2.0)

Mit SCIM legt ein Identitätsanbieter (Microsoft Entra ID, Okta, Authentik,
Keycloak mit SCIM-Erweiterung, JumpCloud ...) Konten und Gruppen in LT4-Docs
automatisch an, hält Namen und E-Mail-Adressen aktuell und deaktiviert Konten,
wenn jemand die Schule/das Team verlässt.

SCIM kümmert sich nur um **Konten und Gruppen**. Die Anmeldung läuft weiter
über SSO (OIDC), LDAP oder Passwort. Meist richtet man SCIM zusammen mit SSO
beim selben Anbieter ein.

## Einrichten in LT4-Docs

1. **Einstellungen > SCIM-Bereitstellung** öffnen (Rollenrecht „SCIM-Abgleich
   verwalten“; Owner haben es immer, Admins nur, wenn ein Owner es ihnen gibt).
2. **SCIM aktivieren** einschalten.
3. **Neues Token** erstellen und sofort kopieren (wird nur einmal gezeigt).
4. Die **SCIM-Basis-URL** kopieren, z. B. `https://newdocmost.lolotron4.de/api/scim/v2`.

Die Basis-URL kommt aus `APP_URL`. Steht dort eine falsche Adresse, stimmen
auch die Links (`meta.location`) in den SCIM-Antworten nicht.

## Einrichten im Anbieter

### Microsoft Entra ID

1. Unternehmensanwendungen > Neue Anwendung > Eigene Anwendung erstellen
   („Nicht-Katalog-Anwendung“).
2. Bereitstellung > Modus **Automatisch**.
3. Mandanten-URL = SCIM-Basis-URL, Geheimes Token = SCIM-Token, **Verbindung testen**.
4. Benutzer und Gruppen zuweisen, Bereitstellung starten.

Entra deaktiviert Konten zuerst (`active = false`) und löscht sie erst später.

### Okta

App-Integration mit „SCIM provisioning“ anlegen, SCIM connector base URL =
Basis-URL, Unique identifier field = `userName`, Authentication Mode =
**HTTP Header** (Bearer-Token). Push New Users, Push Profile Updates,
Push Groups und Deactivate Users aktivieren.

### Authentik

Provider > **SCIM Provider**: URL = Basis-URL, Token = SCIM-Token. Den
Provider als Backchannel-Provider einer Anwendung hinzufügen. Authentik schickt
den Benutzernamen als `userName` und die E-Mail separat; beides wird übernommen.

## Was passiert womit?

| Anbieter macht | LT4-Docs macht |
| --- | --- |
| Konto anlegen mit E-Mail | neues Mitglied (Rolle „Member“) mit dieser E-Mail |
| Konto anlegen ohne E-Mail | Konto mit Benutzername (wie bei Beitrittslinks) |
| Konto anlegen, E-Mail gibt es schon | vorhandenes Konto wird **verknüpft**, nicht doppelt angelegt |
| Name/E-Mail ändern | wird übernommen (E-Mail muss frei sein) |
| Konto deaktivieren (`active=false`) | Konto deaktiviert, alle Sitzungen beendet |
| Konto löschen | Konto gelöscht/anonymisiert wie unter Mitglieder > Löschen |
| Gruppe anlegen | neue Gruppe; gibt es den Namen schon, wird sie übernommen |
| Gruppenmitglieder ändern | Mitglieder werden hinzugefügt/entfernt |
| Gruppe löschen | Gruppe gelöscht |

- **Owner** kann SCIM nie deaktivieren oder löschen (Antwort 400).
- Die Standardgruppe („Alle“) ist für SCIM unsichtbar.
- Neue Konten bekommen ein zufälliges Passwort und melden sich per SSO/LDAP
  an. Schickt der Anbieter ein Passwort mit, wird es gesetzt (Passwortregeln
  unter Sicherheit gelten).
- **Rollen** vergibt SCIM nicht direkt. Gib der abgeglichenen Gruppe unter
  Gruppen eine Rolle (Gruppen-Rolle), dann erben alle Mitglieder sie.
- Alle Änderungen stehen im **Audit-Log** mit „System“ als Handelndem.

## Technische Details

- Endpunkte: `/Users`, `/Groups`, `/ServiceProviderConfig`, `/ResourceTypes`,
  `/Schemas` (GET, POST, PUT, PATCH, DELETE).
- Anmeldung: `Authorization: Bearer lt4scim_...`; gespeichert wird nur ein
  SHA-256-Hash (Kern-Tabelle `scim_tokens`). Tokens lassen sich pausieren oder löschen.
- Filter: `eq ne co sw ew gt ge lt le pr`, `and`/`or`/`not`, Klammern und
  Wertpfade wie `emails[type eq "work"].value eq "..."`.
- Seiten: `startIndex`/`count` (höchstens 200 pro Seite); `attributes` und
  `excludedAttributes` werden beachtet. Kein Bulk, kein Sortieren, keine ETags.
- Der `userName` des Anbieters liegt in `lt4_scim_users`, die externe ID in
  `users.scim_external_id` bzw. `groups.scim_external_id`.

Schnelltest mit curl:

```bash
curl -H "Authorization: Bearer lt4scim_..." \
  "https://newdocmost.lolotron4.de/api/scim/v2/Users?filter=userName%20eq%20%22max%40schule.de%22"
```
