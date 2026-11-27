# Offline-Lesen und App installieren (PWA)

Ab LT4 v1.9.0 lässt sich Docmost als App auf Handy, Tablet oder PC installieren,
und Seiten bleiben ohne Verbindung lesbar (z. B. im Schulbus oder bei schlechtem Schul-WLAN).

## Voraussetzung

- Aufruf über **HTTPS** (z. B. `https://newdocmost.lolotron4.de`). Ohne HTTPS starten Browser keinen Service Worker.
- Einmal mit Verbindung anmelden und die App kurz offen lassen, damit sie sich selbst speichert.

## App installieren

- **Android / Chrome / Edge:** Menü (⋮) > „App installieren“ oder auf der Seite **Offline-Seiten** den Knopf „Installieren“.
- **iPhone / iPad (Safari):** „Teilen“ > „Zum Home-Bildschirm“.
- **PC (Chrome/Edge):** Installations-Symbol rechts in der Adressleiste.

## Welche Seiten sind offline lesbar?

| Art | Wie | Wie lange |
|---|---|---|
| Zuletzt besucht | automatisch beim Öffnen | die letzten 30 Seiten |
| Offline vorgehalten | Seitenmenü (⋯) > „Offline verfügbar machen“ | bis zum Entfernen; wird bei jedem Start mit Verbindung aktualisiert |

Übersicht: Seitenleiste > **Offline-Seiten** (`/offline`). Dort lässt sich das automatische
Speichern ausschalten und einzelne Seiten entfernen.

Bilder und Anhänge der gespeicherten Seiten werden mitgespeichert (höchstens 400 Dateien).

## Ohne Verbindung

- Startet die App ohne Netz, landet man direkt bei der Offline-Kopie der Seite bzw. in der Liste.
- Offline-Kopien sind **nur lesbar** und zeigen den Stand beim letzten Speichern.
- Ist die App schon offen und das Netz fällt weg, erscheint unten ein Hinweis. Änderungen im
  Editor werden dann (wie im normalen Docmost) übertragen, sobald die Verbindung zurück ist.
- Nicht offline: Suche, Bases/Kanban, Kommentare, eingebettete Inhalte anderer Seiten.

## Datenschutz und Rechte

- Gespeichert wird nur, was die Person ohnehin lesen darf, und nur auf ihrem Gerät (IndexedDB + Browser-Cache).
- Beim **Abmelden** werden alle Offline-Seiten und Dateien gelöscht.
- Ist der **Export gesperrt** (Workspace oder „Bereich sperren“), wird nichts offline gespeichert,
  vorhandene Kopien werden entfernt. Verliert jemand den Zugriff auf eine Seite, wird sie beim
  nächsten Abgleich ebenfalls entfernt.

## Technik

- Service Worker: `apps/client/public/lt4-sw.js` (Version im Aufruf `?v=<LT4-Version>`, alte Caches fliegen beim Update raus).
- Code: `apps/client/src/lt4/offline/` (Speicher, Abgleich, Offline-Seiten, Installieren).
- Manifest: `apps/client/public/manifest.json`.
- Kein Server-Teil, keine Migration.
