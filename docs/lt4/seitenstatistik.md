# Seitenstatistik und veraltete Seiten (LT4 v1.3.0)

## Seitenstatistik
Seitenmenü (…) > **Seitenstatistik**. Zeigt für 7 Tage, 30 Tage, 90 Tage oder 1 Jahr:
Aufrufe, Anzahl Lesende, zuletzt geöffnet, zuletzt bearbeitet und einen Verlauf.

- Sehen darf das, wer die Seite bearbeiten darf – **ohne Namen**.
- **Namen** (wer hat wann geöffnet, wer noch nicht) sieht nur, wer das Rollenrecht
  **„Seitenstatistik mit Namen sehen“** hat (Einstellungen > Rollen). Owner haben es immer,
  Admin standardmäßig; gespeicherte Rollen mit „Audit-Log ansehen“ bekommen es per Migration dazu.
  Mit diesem Recht ist die Statistik auch auf Seiten sichtbar, die man nur lesen darf.
- Ein Aufruf zählt, wenn die Seite 3 Sekunden offen ist. Erneutes Öffnen innerhalb von
  30 Minuten zählt nicht doppelt. Gespeichert wird je Seite, Person und Tag (Tabelle
  `lt4_page_views`); Einträge älter als 365 Tage werden automatisch gelöscht.
- Aufrufe über API-Schlüssel/MCP werden nicht gezählt.

## Veraltete Seiten
Seitenleiste > **Veraltete Seiten** (`/outdated-pages`): alle Seiten, die man sehen darf und
die seit 30 Tagen bis 2 Jahren nicht bearbeitet wurden, älteste zuerst. Filter nach Bereich
und „Nur Seiten, die ich erstellt oder zuletzt bearbeitet habe“. Pro Seite: Aufrufe der
letzten 90 Tage (ohne Namen), zuletzt bearbeitet von, Alter.
