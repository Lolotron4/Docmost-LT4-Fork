# Abgaben für Gruppenarbeit

Eine Lehrkraft verteilt eine Vorlage an Gruppen (oder einzelne Personen). Jede Gruppe bekommt eine eigene Seite mit Abgabefrist.

## Ablauf

1. Seitenleiste > **Abgaben** > **Neue Abgabe**: Titel, Aufgabenstellung, Vorlage, Bereich, Gruppen, Frist.
2. Es entsteht eine **Sammelseite** (für alle im Bereich sichtbar) und darunter je Gruppe eine eingeschränkte Seite. Nur die Gruppe und die Lehrkraft sehen und bearbeiten sie.
3. Auf der Seite zeigt eine Leiste Frist und Restzeit. Die Gruppe kann vorher **Abgeben** (Seite wird sofort gesperrt).
4. Nach der Frist sperrt der Server die Seite automatisch (Prüfung jede Minute): die Gruppe kann nur noch lesen, offene Editoren schalten sofort auf "nur lesen".

## Freischalten und verlängern

- **Freischalten**: mit neuer Frist (danach wieder gesperrt) oder ohne Frist (bleibt offen, bis jemand "Jetzt sperren" drückt).
- **Frist verlängern**: für einzelne Gruppen; gesperrte Seiten werden dabei freigeschaltet.
- **Frist für alle ändern** (Menü der Abgabe): gilt für Gruppen ohne eigene Frist.
- Nach dem Freischalten müssen Gruppen die Seite neu laden (Knopf "Neu laden zum Bearbeiten" erscheint).

Verwalten darf die Person, die die Abgabe angelegt hat, und alle mit dem Rollenrecht **Alle Abgaben verwalten** (`assignments`, Einstellungen > Rollen). Owner/Admin haben es automatisch.

## Technik

- Tabellen `lt4_assignments`, `lt4_assignment_submissions` (Migration `20261126T204500-lt4-assignments`).
- Gesperrt wird über die normalen Seitenrechte (Gruppe: Bearbeiten -> Lesen). Damit greift die Sperre überall im Kern.
- Abgabe entfernen löscht nur die Fristverwaltung; die Seiten bleiben und werden wieder bearbeitbar.
- Zeitzone für das Datum auf der Sammelseite: `LT4_TIMEZONE` (Standard Europe/Berlin).
