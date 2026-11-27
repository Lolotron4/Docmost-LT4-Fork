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
| Arbeitsbereich-Einstellungen verwalten | Allgemein, Sicherheit, Anmeldung (SSO/LDAP), Integrationen, öffentliche Freigabe |
| Ankündigungen verwalten | Banner erstellen, ändern, entfernen |
| Webhooks verwalten | Discord- und andere Webhooks einrichten (Einstellungen > Webhooks) |
| Audit-Log ansehen | Audit-Log |
| Mitglieder verwalten | Einladen, Beitrittslinks, Rollen zuweisen, deaktivieren, entfernen |
| Gruppen verwalten | Gruppen anlegen und Mitglieder ändern |
| Rollen verwalten | Rollen unterhalb der eigenen bearbeiten |
| Bereiche verwalten | Bereiche anlegen und alle Bereiche verwalten |
| Vorlagen erstellen | Neue Vorlagen anlegen (Arbeitsbereich oder eigene Bereiche) und eigene Vorlagen verwalten: wo nutzbar, bearbeiten, löschen |
| Vorlagen verwalten | Vorlagen anderer verwalten: wo nutzbar, bearbeiten, löschen |
| Seiten in andere Bereiche kopieren | Kopie in einen Bereich mit Schreibrecht, auch aus Bereichen mit nur Leserecht |
| KI-Assistent nutzen | KI immer nutzen, auch wenn sie auf bestimmte Personen beschränkt ist |
| KI-Assistent verwalten | Anbieter, Schlüssel und Freigabe einrichten |
| Alle API-Schlüssel verwalten | API-Schlüssel aller sehen und widerrufen |

Rollen, die vor LT4 v1.2.0 gespeichert wurden und "Einstellungen" hatten, bekommen Ankündigungen, Vorlagen und beide KI-Rechte per Migration dazu.

Grundrechte (Seiten lesen, auf die man Zugriff hat, Dateien hochladen, eigene API-Schlüssel) hat jede Rolle.

## Technik

- Tabelle `lt4_roles` (Migration `20261126T120000-lt4-roles`). `users.role` bleibt `owner`/`admin`/`member`; eigene Rollen stehen dort mit ihrer UUID.
- Bestehende Installationen brauchen keine Datenänderung: Fehlen die eingebauten Rollen in der Tabelle, gelten die alten Standardrechte (Admin = alles, Mitglied = nichts).
- Beim Löschen einer Rolle bekommen ihre Personen, offene Einladungen und Beitrittslinks eine Ersatzrolle.
- Code: `apps/server/src/lt4/roles`, `apps/client/src/lt4/roles`.

## Rollen für Gruppen

Unter **Einstellungen > Gruppen > (Gruppe)** kann man einer Gruppe eine Rolle geben. Alle Mitglieder der Gruppe bekommen die Rechte dieser Rolle zusätzlich zu ihrer eigenen Rolle. Für die Rangfolge zählt die höchste Rolle einer Person.

- Dafür braucht man „Mitglieder verwalten“, und die Rolle muss unter der eigenen stehen. Die Owner-Rolle kann keiner Gruppe gegeben werden.
- Hat eine Gruppe eine Rolle über oder gleich der eigenen, kann man ihre Mitglieder nicht ändern, die Gruppe nicht löschen und niemanden per Einladung oder Beitrittslink in sie aufnehmen. So kann sich niemand selbst hochstufen.
- Tabelle `lt4_group_roles`, Mitgliedschaften werden im Speicher gehalten und nach Änderungen sofort, sonst jede Minute neu geladen.
