# Webhooks: Discord & Co. (LT4)

Unter **Einstellungen > Webhooks** lassen sich Nachrichten an Discord (oder einen anderen Dienst) einrichten, wenn im Wiki etwas passiert. Dafür braucht man das Rollenrecht **Webhooks verwalten** (Owner und Admin haben es; Rollen mit „Arbeitsbereich-Einstellungen verwalten“ bekommen es beim Update automatisch dazu).

## Discord einrichten

1. In Discord den Kanal bearbeiten (Zahnrad) > **Integrationen** > **Webhooks** > **Neuer Webhook**.
2. Name/Bild nach Wunsch, dann **Webhook-URL kopieren**.
3. In LT4-Docs: **Einstellungen > Webhooks > Neuer Webhook**, Typ **Discord**, URL einfügen.
4. Bereiche wählen (alle oder bestimmte) und die Ereignisse ankreuzen.
5. Im Menü (⋯) **Testnachricht senden**.

Die URL ist geheim (wer sie kennt, kann in den Kanal schreiben). Nach dem Speichern wird sie nur noch gekürzt angezeigt. Zum Ändern einfach eine neue URL eintragen.

## Ereignisse

| Ereignis | Wann |
| --- | --- |
| Neue Seite | etwa 1 Minute nach dem Anlegen (damit der Titel schon da ist). Mehrere neue Seiten in einem Bereich (z. B. Import) werden zu einer Nachricht zusammengefasst. |
| Seite in den Papierkorb verschoben | beim Löschen in den Papierkorb |
| Neuer Kommentar oder Antwort | mit Text des Kommentars (gekürzt) |
| Kommentar erledigt | beim Abhaken |
| Seite zur Prüfung eingereicht / genehmigt / zurückgegeben | Seitenprüfung, beim Zurückgeben mit Kommentar |
| Lesebestätigung angefordert | beim Anfordern und bei „erneut anfordern“, mit Nachricht und Frist |
| Alle haben das Lesen bestätigt | sobald die letzte Person bestätigt |
| Neues Mitglied beigetreten | nur bei Webhooks für **alle Bereiche** |

**Seiten mit eingeschränktem Zugriff** (Seitenrechte, auch geerbt) werden nie gemeldet. Nachrichten können in Discord niemanden anpingen (@everyone und Rollen-Erwähnungen sind abgeschaltet).

## Fehler

Die Liste zeigt, wann zuletzt gesendet wurde und ob es geklappt hat. Nach 10 Fehlern in Folge schaltet sich ein Webhook aus. Antwortet Discord mit „Webhook unbekannt“ (gelöscht), wird er sofort ausgeschaltet. Mit dem Schalter lässt er sich wieder einschalten.

## Anderer Dienst (JSON)

Typ **Anderer Dienst (JSON)** schickt eine POST-Anfrage mit JSON an eine beliebige http(s)-URL (z. B. n8n, Home Assistant, eigener Bot):

```json
{
  "event": "comment.created",
  "title": "Neuer Kommentar: Serverregeln",
  "text": "Kommentartext …",
  "url": "https://wiki.example.de/s/team/p/abc123",
  "timestamp": "2026-11-26T20:00:00.000Z",
  "actor": { "id": "…", "name": "Mario" },
  "space": { "id": "…", "name": "Team", "slug": "team" },
  "page": { "id": "…", "title": "Serverregeln", "url": "…" },
  "data": { "commentId": "…", "parentCommentId": null, "text": "…" }
}
```

Header: `X-LT4-Event` (Ereignis), `X-LT4-Webhook-Id` und `X-LT4-Signature: sha256=<HMAC-SHA256 des Inhalts>`. Das Geheimnis wird beim Anlegen einmal angezeigt und kann im Menü neu erzeugt werden.

Ereignisnamen: `page.created`, `page.trashed`, `comment.created`, `comment.resolved`, `review.requested`, `review.approved`, `review.rejected`, `read.requested`, `read.completed`, `member.joined`, `test`.
