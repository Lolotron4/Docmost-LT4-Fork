# MCP-Schnittstelle

Über das Model Context Protocol (MCP) können KI-Werkzeuge wie Claude Code,
Claude Desktop, Cursor oder VS Code direkt mit LT4-Docs arbeiten: Seiten
suchen, lesen, anlegen und ergänzen.

## Einschalten

1. Als Admin **Einstellungen → API-Schlüssel** öffnen.
2. Unten bei **MCP-Schnittstelle** den Schalter einschalten (Standard: aus).
3. Jedes Mitglied legt dort einen eigenen API-Schlüssel an.
   - *Lesen und schreiben*: alle Werkzeuge.
   - *Nur lesen*: nur suchen und lesen.

Die Seite zeigt die Serveradresse (`https://<deine-adresse>/mcp`) und fertige
Konfigurationen zum Kopieren.

## Werkzeuge

| Werkzeug | Was es tut |
| --- | --- |
| `list_spaces` | Bereiche, in denen man Mitglied ist |
| `search_pages` | Volltextsuche |
| `list_pages` | Seitenbaum eines Bereichs oder Unterseiten einer Seite |
| `get_page` | Seite als Markdown lesen |
| `create_page` | Neue Seite (Markdown), optional unter einer Elternseite |
| `update_page` | Titel ändern, Markdown anhängen, voranstellen oder ersetzen |

## Rechte

Das Werkzeug hat genau die Rechte des Schlüssel-Besitzers: nur seine Bereiche,
gesperrte Seiten bleiben gesperrt, Nur-Lese-Schlüssel können nichts ändern.
Ist "Nur Admins dürfen die API nutzen" an, funktioniert MCP nur mit Schlüsseln
von Admins. Ein widerrufener Schlüssel wirkt sofort.

## Beispiel Claude Code

```
claude mcp add --transport http lt4-docs https://docs.example.de/mcp --header "Authorization: Bearer <API-Schlüssel>"
```
