# Aufgaben mit Fälligkeit (LT4)

Seit LT4-Docs v1.4.0 lassen sich Checkboxen auf Seiten Personen zuweisen.

## So geht's

1. Auf einer Seite `/aufgabe` tippen ("Aufgabe zuweisen") oder eine normale Checkbox-Liste (`/to-do`) nutzen.
2. In der Zeile eine Person mit `@Name` erwähnen. Mehrere Personen sind möglich.
3. Optional mit `/datum` ein Datum einfügen. Das erste Datum in der Zeile ist die Fälligkeit.

Unteraufgaben (eingerückte Checkboxen) sind eigene Aufgaben.

## Übersicht "Meine Aufgaben"

Seitenleiste > **Meine Aufgaben** (`/tasks`):

- **Mir zugewiesen** / **Von mir vergeben**, jeweils **Offen** oder **Erledigt**
- Gruppiert nach Überfällig, Heute, Morgen, Nächste 7 Tage, Später, Ohne Fälligkeit
- Abhaken direkt in der Übersicht ändert die Checkbox auf der Seite. Die zugewiesene Person darf ihre Aufgabe auch mit nur Leserecht abhaken.
- Zähler in der Seitenleiste: rot = heute fällig oder überfällig, grau = offen

## Benachrichtigungen (in der App)

- "Aufgabe zugewiesen" (statt der normalen Erwähnungs-Meldung)
- "morgen fällig" bzw. "heute fällig" (einmal)
- "überfällig" (einmal, bis 8 Tage nach Fälligkeit)

Erinnerungen gehen ab 7 Uhr in der Zeitzone der Person raus (Profil-Einstellung, sonst Europe/Berlin).
Im Editor sind überfällige Daten in offenen Aufgaben rot, heute fällige orange.

## Technik

- Tabelle `lt4_tasks` (Migration `20261126T210000-lt4-tasks`), ein Eintrag pro Aufgabe und Person.
  Sie wird beim Speichern einer Seite abgeglichen; vorhandene Seiten werden bei der Migration
  ohne Benachrichtigung eingelesen.
- Code: `apps/server/src/lt4/tasks`, `apps/client/src/lt4/tasks`.
