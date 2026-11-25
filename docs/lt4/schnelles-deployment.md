# Schnelles Deployment mit fertigem Image

Standardmäßig baut Portainer bei jedem "Pull and redeploy" das komplette Image auf dem
Server. Das dauert lange und bricht hinter einem Reverse-Proxy oft mit 504 ab.

Schneller: GitHub baut das Image bei jedem Push (Workflow `.github/workflows/lt4-image.yml`)
und legt es in der GitHub Container Registry ab. Portainer lädt es dann nur noch herunter.

## Image-Namen

`ghcr.io/lolotron4/docmost-lt4-fork:<branch>`. Im Branchnamen wird `/` zu `-`:

| Branch          | Image                                              |
|-----------------|----------------------------------------------------|
| `main`          | `ghcr.io/lolotron4/docmost-lt4-fork:main`          |
| `lt4/themes`    | `ghcr.io/lolotron4/docmost-lt4-fork:lt4-themes`    |

Der Build ist fertig, wenn unter GitHub → Actions → "LT4 Image" ein grüner Haken steht
(ca. 10 Minuten beim ersten Mal, danach schneller dank Cache).

## Einmalig einrichten

1. **Paket öffentlich machen** (nur einmal nötig): GitHub → Profil → Packages →
   `docmost-lt4-fork` → Package settings → Change visibility → Public.
   Alternativ in Portainer unter Registries die `ghcr.io` mit einem GitHub-Token
   (Recht `read:packages`) hinterlegen.
2. In Portainer im Stack unter **Environment variables** ergänzen:
   - `LT4_IMAGE` = `ghcr.io/lolotron4/docmost-lt4-fork:main`
   - `LT4_PULL_POLICY` = `always`
3. **Pull and redeploy**. Ab jetzt wird nichts mehr auf dem Server gebaut.

## Einen anderen Branch testen

Branch-Referenz im Stack umstellen **und** `LT4_IMAGE` auf den passenden Tag setzen
(z. B. `...:lt4-themes`), warten bis der Build auf GitHub grün ist, dann "Pull and redeploy".

## Zurück zum Bauen auf dem Server

`LT4_IMAGE` und `LT4_PULL_POLICY` löschen. Dann gilt wieder der alte Weg.
