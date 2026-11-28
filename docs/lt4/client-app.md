# LT4-Docs Client (Windows, Linux, macOS)

Ab LT4 v1.12.0 gibt es einen eigenen Client. Er funktioniert **komplett ohne Internet und ohne
Konto** als lokales Notizbuch und kann später mit einem LT4-Server zusammenarbeiten.
Android folgt in Phase 4, iPadOS ist vorerst nicht geplant.

Stand: Phase 1 (lokales Notizbuch, App-Sperre, Export/Import, Server öffnen).
Plan für die weiteren Phasen: Dokument „LT4-Docs Client für Desktop und Android – Plan“.

## Installieren

1. Auf GitHub rechts bei **Releases** die Vorab-Version **„LT4-Docs Client – neueste Version“**
   öffnen (Adresse: `…/releases/tag/client-latest`). Sie wird nach jedem Build automatisch
   ersetzt und lässt sich ohne GitHub-Login laden. Alternativ: **Actions › LT4 Client-App ›
   Lauf › Artifacts** (nur mit Login, als ZIP).
2. Die Datei für dein System laden:
   - `lt4-docs-windows`: `.msi` oder `…-setup.exe`
   - `lt4-docs-linux`: `.deb` (Debian/Ubuntu) oder `.AppImage` (alle Distributionen)
   - `lt4-docs-macos`: `.dmg` (Apple Silicon)
   - `lt4-docs-android`: `LT4-Docs_<version>.apk`
3. Die Dateien sind **nicht signiert**:
   - Windows: SmartScreen › „Weitere Informationen“ › „Trotzdem ausführen“.
   - macOS: Rechtsklick auf die App › „Öffnen“ (oder Systemeinstellungen › Datenschutz & Sicherheit › „Dennoch öffnen“).
   - Linux (AppImage): Datei ausführbar machen (`chmod +x`).
   - Android: APK aufs Handy laden und öffnen; einmalig „Installieren aus unbekannten Quellen“
     für den Browser/Dateimanager erlauben.

### Android-Schlüssel (einmal einrichten)

Android installiert Updates nur, wenn jede APK mit **demselben Schlüssel** signiert ist. Ohne
hinterlegten Schlüssel signiert der Workflow mit einem Einmal-Schlüssel (Warnung im Lauf); dann
muss man die App vor einem Update deinstallieren, und die lokalen Daten sind weg.

Schlüssel einmal erzeugen (Java nötig) und als Secrets hinterlegen
(GitHub › Settings › Secrets and variables › Actions):

```bash
keytool -genkeypair -keystore lt4docs.jks -alias lt4docs -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 lt4docs.jks   # macOS: base64 -i lt4docs.jks
```

| Secret | Inhalt |
|---|---|
| `LT4_ANDROID_KEYSTORE` | Ausgabe von `base64` |
| `LT4_ANDROID_KEYSTORE_PASSWORD` | Passwort aus `keytool` |
| `LT4_ANDROID_KEY_ALIAS` | `lt4docs` |

Die Datei `lt4docs.jks` gut aufheben, sie lässt sich nicht neu erzeugen.

### Unterschiede auf Android

- Server öffnen sich im Browser des Handys (eigene Fenster gibt es dort nicht).
- PDF-Export fehlt noch (kein Druckdialog in der App); Word, Excel, .lt4docs und Markdown gehen.
- Fingerabdruck kommt mit Phase 4.

Für eine feste Version einen Tag `client-vX.Y.Z` pushen, dann entsteht ein Release-Entwurf mit allen Dateien.

## Erster Start

Beim ersten Start wählst du die App-Sperre:

| Sperre | Regel |
|---|---|
| Muster | mindestens 4 von 9 Punkten verbinden |
| PIN | mindestens 6 Ziffern |
| Passwort | mindestens 8 Zeichen |
| Keine | nicht empfohlen auf geteilten Rechnern |

Aus dem Code wird der Schlüssel für die lokalen Daten erzeugt (Argon2id, Verschlüsselung
XChaCha20-Poly1305). Ohne Sperre liegt der Schlüssel im Schlüsselbund des Systems.

- Automatisch sperren nach 1, 5 (Standard), 15 oder 60 Minuten ohne Eingabe, oder nie.
- Nach 5 Fehlversuchen steigen die Wartezeiten (30 s, 60 s, … bis 1 Stunde).
- **Code vergessen = lokale Daten weg.** Darum erinnert der Client alle 14 Tage an einen Export.
- Ehrliche Grenze: Muster und kurze PIN schützen gegen Mitschüler am Gerät. Gegen eine
  ausgebaute Festplatte schützt nur ein langes Passwort.
- Fingerabdruck (Android, Touch ID, Windows Hello) kommt mit Phase 4.

## Notizbuch

- Bereiche und Seiten mit Unterseiten, Seiten verschieben und löschen.
- Editor mit Überschriften, Fett/Kursiv/Unterstrichen, **Hex-Textfarben und Hervorhebungen**,
  Links, Listen, Aufgabenlisten, Zitaten, Codeblöcken, Infoboxen, aufklappbaren Bereichen,
  Tabellen, Trennlinien und Bildern (auch per Einfügen/Ziehen).
- Suche über Titel und Inhalt, funktioniert offline.

## Exportieren und auf dem Server importieren

Knopf **Exportieren** (Pfeil nach unten) oben rechts:

| Format | Wofür | Formatierung |
|---|---|---|
| **LT4-Docs (.lt4docs)** | Import auf einem LT4-Server, Sicherung | verlustfrei |
| Word (.docx) | Abgeben, weitergeben, in Word weiterbearbeiten | Text, Überschriften, Listen, Tabellen, Bilder; Infobox-Farben nicht |
| PDF | Drucken, Abgeben | wie in der App; im Druckdialog „Als PDF speichern“ bzw. „Microsoft Print to PDF“ wählen |
| Excel (.xlsx) | Tabellen weiterrechnen | nur Tabellen: jede Tabelle ein Blatt (Name = Seitentitel), erste Zeile fett und fixiert, Zahlen als Zahlen |
| Markdown (.zip) | andere Programme | Farben und LT4-Blöcke gehen verloren |

Word, PDF und Excel gehen für ganze Bereiche oder nur für die gerade offene Seite (wahlweise mit
Unterseiten). Mehrere Seiten landen in einem Dokument, jede beginnt mit ihrem Titel als Überschrift.
Nur ein .lt4docs-Export zählt als Sicherung für die 14-Tage-Erinnerung.

Exportieren geht immer ohne Login. Für den Import auf dem Server musst du dort angemeldet sein:
Bereich öffnen › **Seiten importieren › LT4-Docs** › Datei wählen. Die Seiten landen mit
Seitenbaum, Bildern und Formatierung im Bereich. Bei mehreren Bereichen in einer Datei gibt
es pro Bereich eine Sammelseite.

Umgekehrt geht es auch: In der Web-App **Seite oder Bereich exportieren › Format „LT4-Docs (.lt4docs)“**
und die Datei im Client über „Datei einlesen“ übernehmen (z. B. um einen Bereich mitzunehmen).

„Datei einlesen“ im selben Fenster übernimmt eine .lt4docs-Datei in das lokale Notizbuch
(z. B. auf ein zweites Gerät). Dabei bekommen alle Seiten neue IDs, es wird nichts überschrieben.

## Server

Unter **Einstellungen › Server** Server hinzufügen, umbenennen, Adresse ändern oder entfernen
und einen Standard-Server festlegen. Ein Server öffnet sich in einem eigenen Fenster mit der
normalen Anmeldung (Passwort, Benutzername, SSO, LDAP, 2FA). Fremde Seiten in diesem Fenster
haben keinen Zugriff auf die lokalen Daten.

Direktes Hochladen aus dem Client und ganze Bereiche offline speichern kommen in Phase 2 und 3.

## Technik

- Code: `apps/client-app` (React + Mantine + Tiptap im Tauri-2-WebView), Rust-Teil in
  `apps/client-app/src-tauri` (Tresor, Export, Server-Fenster).
- Editor-Knoten kommen aus `@docmost/editor-ext`, damit Seiten auf dem Server gleich aussehen.
- Daten: App-Datenordner › `vault/` (`vault.json`, `data/*.bin`, `files/*.bin`, alles verschlüsselt).
- Server-Import: `apps/server/src/lt4/lt4docs-import`, Quelle `lt4docs` in `POST /api/pages/import-zip`.
- Format: [lt4docs-format.md](lt4docs-format.md).
- Entwickeln: `cd apps/client-app && pnpm tauri dev` (Linux braucht `libwebkit2gtk-4.1-dev`).
