# Confluence-Import (LT4)

Ganze Confluence-Bereiche lassen sich mit Seitenbaum, Bildern und Anhängen in einen Bereich von LT4-Docs übernehmen.

## 1. In Confluence exportieren

**Confluence Cloud:** Bereich öffnen > **Bereichseinstellungen** > **Bereich exportieren** (unter „Bereich verwalten“ bzw. „Tools“) > Format **HTML** > „Normaler Export“ oder „Benutzerdefiniert“ (einzelne Seiten wählen) > ZIP herunterladen.

**Confluence Server / Data Center:** Bereich > **Bereichswerkzeuge** > **Inhaltswerkzeuge** > **Exportieren** > **HTML**.

Wichtig: Es muss der **HTML-Export** sein. Der XML-Export (für Confluence-Sicherungen) und PDF/Word werden nicht unterstützt.

## 2. In LT4-Docs importieren

1. Den Zielbereich öffnen, in der Seitenleiste neben dem Bereichsnamen auf **⋯ > Importieren**.
2. **Confluence** wählen und die ZIP-Datei unverändert hochladen.
3. Der Import läuft im Hintergrund. Sobald er fertig ist, erscheint „Import abgeschlossen“ und die Seiten stehen in der Seitenleiste.

Man braucht dafür **Bearbeitungsrechte im Zielbereich** (wie bei allen Importen). Die maximale Dateigröße steuert die Server-Variable `FILE_IMPORT_SIZE_LIMIT` (Standard 200 MB).

## Was übernommen wird

| Confluence | LT4-Docs |
| --- | --- |
| Seitenbaum (Eltern/Kinder, Reihenfolge) | gleicher Seitenbaum. Mehrere Bereiche in einer ZIP-Datei bekommen je eine eigene Oberseite. |
| Seitentitel | Seitentitel (ohne „Bereich : “ davor) |
| Bilder, Dateien, PDFs, Videos, Audio | Anhänge der Seite. Dateien, die nur an der Seite hängen, aber im Text nicht vorkommen, landen unten unter **Anhänge**. |
| draw.io-Diagramme | draw.io-Block (weiter bearbeitbar) |
| Info / Hinweis / Tipp / Warnung | Infobox blau / gelb / grün / rot |
| Panel-Makro | neutrale Infobox mit Überschrift |
| Code-Makro | Codeblock mit Sprache (z. B. Java, Bash, SQL) und Titel |
| Aufklapper (Expand) | aufklappbarer Block |
| Status-Lozenges | Status-Markierung in passender Farbe |
| Aufgabenlisten | Checklisten (abgehakt bleibt abgehakt) |
| Seitenlayouts (Spalten) | Spalten-Block |
| Tabellen, Überschriften, Listen, Formatierung | gleich |
| Emoticons | Emoji |
| Links auf andere importierte Seiten (auch absolute Wiki-Links) | interne Links bzw. Seiten-Erwähnungen |
| Unterseiten-Makro (Children / Page Tree) | Unterseiten-Block |
| Inhaltsverzeichnis-Makro | entfällt (LT4-Docs zeigt die Gliederung selbst) |
| @Erwähnungen von Personen | Text „@Name“ (Konten werden nicht verknüpft) |

Nicht übernommen werden Kommentare, Seitenversionen, Autor und Datum (als Ersteller gilt die Person, die importiert), Seitenrechte und Labels. Makros von Erweiterungen (z. B. Jira-Vorgänge) bleiben als normaler Text bzw. Link stehen.

## Fehler

- **„Keine Confluence-Seiten gefunden“**: Die ZIP-Datei ist kein HTML-Export (z. B. XML-Export) oder wurde neu gepackt. Den Export direkt aus Confluence hochladen.
- Bricht der Import ab, wird nichts halb angelegt: Seiten werden in einer Transaktion gespeichert.

Code: `apps/server/src/lt4/confluence-import/` (eigenständig geschrieben, kein Docmost-Enterprise-Code). Der Kern ruft ihn aus `file-import-task.service.ts` auf.
