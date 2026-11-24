# Integrationen: GitHub und GitLab

LT4-Docs zeigt Links auf GitHub und GitLab als Vorschaukarte an: Titel, Status
(offen, gemergt, geschlossen), Autor und Zeitpunkt. Das funktioniert für Pull
Requests und Merge Requests, Issues, Commits, Dateien (GitHub) und ganze
Repositories bzw. Projekte.

## Einrichten in drei Minuten (nur öffentliche Repos)

1. Als Admin **Einstellungen → Integrationen** öffnen.
2. Bei GitHub oder GitLab auf **Installieren** klicken und bestätigen.
3. Einen Link, z. B. `https://github.com/docmost/docmost/pull/1`, in eine Seite
   einfügen. Es erscheint ein Menü: **Karte**, **Erwähnung** oder **Link**.

Ohne OAuth-App fragt der Server die Anbieter anonym ab. GitHub erlaubt dabei
60 Anfragen pro Stunde und Server; jede Karte wird 5 Minuten zwischengespeichert,
für eine Schule oder ein kleines Team reicht das. Links auf private Repositories
bleiben normale Links.

## Private Repositories (mit OAuth-App)

Mit einer OAuth-App verbindet jedes Mitglied unter **Einstellungen → Verbindungen**
sein eigenes Konto. Jeder sieht dann nur Vorschauen für Repositories, auf die er
selbst Zugriff hat.

### GitHub

1. Auf GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: die Adresse von LT4-Docs, z. B. `https://docs.example.de`.
3. Authorization callback URL: `https://docs.example.de/api/integrations/oauth/github/callback`
4. Client-ID und ein neues Client-Secret kopieren.
5. Im Portainer-Stack unter *Environment variables* eintragen:
   `INTEGRATION_GITHUB_CLIENT_ID` und `INTEGRATION_GITHUB_CLIENT_SECRET`,
   dann den Stack neu deployen.

Für GitHub Enterprise zusätzlich `INTEGRATION_GITHUB_URL` setzen.

### GitLab

1. Auf GitLab: **Benutzereinstellungen → Anwendungen → Neue Anwendung**
   (oder in einer Gruppe unter *Einstellungen → Anwendungen*).
2. Redirect-URI: `https://docs.example.de/api/integrations/oauth/gitlab/callback`
3. Vertraulich: ja. Bereich (Scope): **read_api**.
4. Anwendungs-ID und Geheimnis als `INTEGRATION_GITLAB_CLIENT_ID` und
   `INTEGRATION_GITLAB_CLIENT_SECRET` im Stack eintragen und neu deployen.

Für eine eigene GitLab-Instanz zusätzlich `INTEGRATION_GITLAB_URL` setzen,
z. B. `https://git.schule.de`. Dann gelten nur Links auf diese Instanz.

Ist eine Integration schon ohne OAuth-App installiert, muss sie nach dem
Eintragen der Variablen nicht neu installiert werden. Mitglieder verbinden ihr
Konto einfach unter **Verbindungen**.

## Sicherheit

- Tokens werden nur an den eingestellten Host geschickt (github.com bzw. die
  eingestellte GitLab-Instanz), Weiterleitungen folgt der Server nicht.
- Anonyme Vorschauen enthalten nur öffentliche Daten.
- Installieren und Deinstallieren dürfen nur Admins; beides steht im Audit-Log.
