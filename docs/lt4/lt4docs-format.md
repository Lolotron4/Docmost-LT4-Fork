# Dateiformat .lt4docs (Version 1)

Verlustfreier Austausch von Seiten zwischen LT4-Docs Client und LT4-Server.

Erzeugt wird das Format vom Client (Exportieren) und vom Server (Seite oder Bereich exportieren ›
„LT4-Docs (.lt4docs)“, Code `apps/server/src/lt4/lt4docs-export`). Der Server-Export enthält nur
Seiten und Anhänge, die der Nutzer sehen darf (Seitenrechte), und rechnet die Docmost-Positionen
in ganze Zahlen je Ebene um. Gelesen wird es vom Client („Datei einlesen“) und vom Server
(„Seiten importieren › LT4-Docs“).
Eine `.lt4docs`-Datei ist ein ZIP:

```
manifest.json
pages/<seiten-id>.json          Seiteninhalt als ProseMirror-JSON (Editor-Format)
bases/<seiten-id>.json          nur bei Datenbanken: Eigenschaften, Ansichten, Zeilen
attachments/<anhang-id>/<name>  Bilder und Dateien
```

## Datenbanken (Tabelle, Kanban, Kalender)

Eine Seite mit `"isBase": true` im Manifest ist eine Datenbank. Ihr Inhalt steht in
`bases/<seiten-id>.json`, im gleichen Aufbau wie die LT4-Datenbank-API:

```json
{
  "properties": [{ "id": "pab12", "name": "Status", "type": "select", "position": "a1",
                   "typeOptions": { "options": [{ "id": "o1", "name": "Erledigt", "color": "green" }] },
                   "isPrimary": false }],
  "views": [{ "id": "…", "name": "Board", "type": "kanban", "position": "a0",
              "config": { "groupByPropertyId": "pab12" } }],
  "rows": [{ "id": "…", "position": "a0", "cells": { "pab12": "o1" } }]
}
```

Typen: `text`, `number`, `select`, `multiSelect`, `date` (`{start, end?}`, mit `includeTime`
auch `JJJJ-MM-TTTHH:mm`), `checkbox`, `url`, `formula` (wird nicht gespeichert, sondern berechnet).
Ansichten: `table`, `kanban`, `calendar`. Beim Import prüft der Server alle Werte wie bei
Eingaben in der Oberfläche, behält die Eigenschafts-IDs und vergibt neue Zeilen- und Ansichts-IDs.
Eingebettete Datenbanken (Knoten `base` mit `pageId`) werden auf die neuen Seiten-IDs umgestellt.

## manifest.json

```json
{
  "format": "lt4docs",
  "version": 1,
  "generator": "LT4-Docs Client 0.1.0",
  "exportedAt": "2026-11-27T09:00:00.000Z",
  "spaces": [{ "id": "…", "name": "Meine Notizen", "icon": null }],
  "pages": [
    { "id": "…", "spaceId": "…", "parentId": null, "title": "Projektplan",
      "icon": null, "position": 0, "createdAt": "…", "updatedAt": "…" }
  ],
  "attachments": [
    { "id": "…", "pageId": "…", "fileName": "bild.png", "mimeType": "image/png",
      "size": 4722, "path": "attachments/…/bild.png" }
  ]
}
```

## Regeln

- IDs: `[A-Za-z0-9_-]`, höchstens 64 Zeichen. Der Server vergibt beim Import neue IDs.
- Anhänge werden im Dokument über `attrs.attachmentId` gefunden; `src`/`url` wird beim Import
  auf `/api/files/<neue-id>/<name>` gesetzt. Lokale Verweise `local-attachment/…` ohne Datei werden geleert.
- Unbekannte Knoten (z. B. aus einer neueren Client-Version) entfernt der Server beim Import.
- Fehlende Eltern oder Zyklen im Seitenbaum: die Seite kommt auf die oberste Ebene.
- Höchstens 5000 Seiten pro Datei. Eine höhere `version` lehnt der Server mit Hinweis ab.
