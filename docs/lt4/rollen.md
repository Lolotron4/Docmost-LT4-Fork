# Eigene Rollen (LT4)

Unter **Einstellungen > Rollen** lassen sich Rollen anlegen, umbenennen, bearbeiten, verschieben und löschen.

## Rangfolge

Rollen stehen von oben nach unten. Ganz oben steht immer der **Owner**.

- Der Owner darf alles: jede Rolle bearbeiten, umbenennen (auch Owner/Admin/Mitglied), verschieben und Personen jede Rolle geben.
- Alle anderen brauchen das Recht **Rollen verwalten** und dürfen dann nur Rollen **unterhalb** ihrer eigenen Rolle ändern. Die eigene Rolle und höhere Rollen sind gesperrt.
- Man kann nur Rechte vergeben oder entziehen, die man selbst hat.
- Personen verwalten (Rolle ändern, deaktivieren, löschen, Passwort setzen) geht ebenfalls nur bei Personen mit einer Rolle unterhalb der eigenen. Admins können also keine anderen Admins mehr herabstufen; das macht der Owner.

## Rechte

| Recht | Erlaubt |
| --- | --- |
| Arbeitsbereich-Einstellungen verwalten | Allgemein, Sicherheit, KI, Ankündigungen, Integrationen, Arbeitsbereich-Vorlagen |
| Mitglieder verwalten | Einladen, Beitrittslinks, Rollen zuweisen, deaktivieren, entfernen |
| Bereiche verwalten | Bereiche anlegen und alle Bereiche verwalten |
| Gruppen verwalten | Gruppen anlegen und Mitglieder ändern |
| Alle API-Schlüssel verwalten | API-Schlüssel aller sehen und widerrufen |
| Audit-Log ansehen | Audit-Log |
| Rollen verwalten | Rollen unterhalb der eigenen bearbeiten |

Grundrechte (Seiten lesen, auf die man Zugriff hat, Dateien hochladen, eigene API-Schlüssel) hat jede Rolle.

## Technik

- Tabelle `lt4_roles` (Migration `20261126T120000-lt4-roles`). `users.role` bleibt `owner`/`admin`/`member`; eigene Rollen stehen dort mit ihrer UUID.
- Bestehende Installationen brauchen keine Datenänderung: Fehlen die eingebauten Rollen in der Tabelle, gelten die alten Standardrechte (Admin = alles, Mitglied = nichts).
- Beim Löschen einer Rolle bekommen ihre Personen, offene Einladungen und Beitrittslinks eine Ersatzrolle.
- Code: `apps/server/src/lt4/roles`, `apps/client/src/lt4/roles`.
