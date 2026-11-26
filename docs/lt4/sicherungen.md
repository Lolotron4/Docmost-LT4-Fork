# Sicherungen aus der Oberfläche

Unter **Einstellungen → Sicherungen** lassen sich Datenbank und Anhänge sichern,
herunterladen, hochladen und wiederherstellen. Ohne Shell, ohne `pg_dump` von Hand.

## Wer darf das?

- **Owner** immer.
- Alle anderen nur mit dem Rollenrecht **„Sicherungen verwalten"** (Einstellungen → Rollen).
  Die eingebaute Admin-Rolle hat es standardmäßig **nicht**, weil Wiederherstellen alle Daten ersetzt.
- Nur mit normaler Anmeldung, **nicht** per API-Schlüssel.

## Was steckt in einer Sicherung?

Eine Datei `lt4-backup-<Datum>_<Uhrzeit>-<Kennung>.tar.gz` mit

| Inhalt | |
| --- | --- |
| `manifest.json` | Zeitpunkt, wer, Postgres-/Docmost-Version, letzte Migration |
| `database.dump` | ganze Datenbank (`pg_dump`, Custom-Format) |
| `storage/…` | alle Anhänge (nur beim lokalen Speicher, auf Wunsch abwählbar) |

Mit S3/Azure als Speicher werden nur die Datenbank gesichert; die Dateien sichert man beim Anbieter.

## Wo liegen die Sicherungen?

Im Datenordner der App: `DATA_DIR/docmost/lt4-backups` auf dem Host
(im Container `/app/data/storage/lt4-backups`). Dort liegt auch `settings.json` mit dem Zeitplan.
Diese Dateien werden bewusst **nicht** in der Datenbank gespeichert, damit eine Wiederherstellung
Liste und Zeitplan nicht überschreibt. Der Ordner selbst wird nicht mitgesichert.

Eigener Ordner (z. B. andere Platte): Variable `LT4_BACKUP_DIR` setzen und den Ordner als Volume einbinden.

**Tipp:** Wichtige Sicherungen herunterladen und woanders aufbewahren. Eine Sicherung auf derselben
Platte hilft nicht, wenn die Platte kaputtgeht.

## Automatische Sicherungen

Täglich oder wöchentlich zu einer vollen Stunde (Zeitzone des Browsers beim Speichern).
„Behalten" = so viele automatische Sicherungen bleiben, ältere werden gelöscht.
Manuelle, hochgeladene und „Vor Wiederherstellung"-Sicherungen werden nie automatisch gelöscht.
Läuft der Server zur geplanten Stunde nicht, fällt diese Sicherung aus.

## Wiederherstellen

1. In der Liste bei der Sicherung **⋯ → Wiederherstellen**.
2. Optional „Auch Anhänge wiederherstellen" abwählen.
3. Bestätigen. Ablauf:
   - Automatisch wird erst eine Sicherung des aktuellen Stands angelegt (Typ „Vor Wiederherstellung").
   - Die Datenbank wird in **einer Transaktion** ersetzt. Schlägt etwas fehl, bleibt alles unverändert.
   - Anhänge werden ausgetauscht.
   - Der Server startet neu (Docker startet ihn dank `restart: unless-stopped` wieder),
     führt fehlende Migrationen aus, und die Seite lädt neu.

Eine Sicherung aus einer **älteren** LT4-Version lässt sich einspielen; beim Neustart laufen die
neueren Migrationen. Eine Sicherung aus einer **neueren** Version erst nach einem Update einspielen.

## Umzug auf einen anderen Server

Alte Instanz: Sicherung erstellen, herunterladen. Neue Instanz einrichten, als Owner anmelden,
**Sicherung hochladen**, wiederherstellen. Danach gelten die Konten aus der Sicherung.

Hinter Nginx Proxy Manager muss für große Uploads die Grenze erhöht sein
(Proxy Host → Advanced: `client_max_body_size 0;`). Obergrenze in LT4: `LT4_BACKUP_UPLOAD_LIMIT` (Standard 20gb).

## Technik

- Das LT4-Image enthält `pg_dump`/`pg_restore`/`psql` in den Versionen 16, 17 und 18.
  Genommen wird die Version des Datenbankservers (sonst die nächsthöhere).
  Andere Pfade: `LT4_PG_BIN_DIR`.
- `LT4_BACKUP_RESTART=false` verhindert den automatischen Neustart nach dem Wiederherstellen
  (dann den Container von Hand neu starten).
- Jede Aktion steht im Audit-Log (Kategorie „Sicherungen").
