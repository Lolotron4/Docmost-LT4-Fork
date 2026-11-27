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
attachments/<anhang-id>/<name>  Bilder und Dateien
```

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
