# Docmost LT4-Fork

Dieser Fork baut die Bezahl-Funktionen von Docmost eigenständig nach, auf Basis des freien AGPL-3.0-Kerns.

## Lizenz

- Der gesamte Code in diesem Repository steht unter der **AGPL-3.0** (siehe `LICENSE`).
- Die Enterprise-Ordner von Docmost (`apps/client/src/ee`, `packages/ee`, Submodul `apps/server/src/ee`) stehen unter einer proprietären Lizenz. Sie wurden **entfernt** und werden nicht verwendet.
- Alle Funktionen in `apps/*/src/lt4/` sind eigenständig neu geschrieben, ohne den Enterprise-Code als Vorlage.
- Wer eine geänderte Version für andere betreibt (Schule, Team), muss ihnen den Quellcode anbieten (AGPL §13). Dieses öffentliche Repository erfüllt das.

## Aufbau

| Ort | Inhalt |
| --- | --- |
| `apps/server/src/lt4/` | Server-Module des Forks (z. B. Seitenrechte-API) |
| `apps/server/src/lt4/lt4-features.ts` | Liste der Features, die der Fork anbietet. Nur diese erscheinen im Client als verfügbar. |
| `apps/server/src/integrations/environment/license-check.service.ts` | Ersetzt die Lizenzprüfung durch die Feature-Liste |
| `apps/client/src/lt4/` | Client-Module des Forks. Noch nicht gebaute Features sind dort als Platzhalter angelegt. |

Eigener Code liegt bewusst in eigenen Ordnern, damit Updates von Docmost (`upstream`) mit wenig Konflikten eingespielt werden können. Im Kern wurden vor allem die Importpfade `@/ee/…` auf `@/lt4/…` umgestellt.

## Stand

| Feature | Status |
| --- | --- |
| Seitenrechte pro Seite | fertig |
| 2FA (TOTP) mit Backup-Codes, Pflicht pro Workspace, Admin-Reset | fertig |
| Beitrittslinks mit Registrierungscode, Konten ohne E-Mail (Benutzername), automatische Gruppenzuordnung | fertig |
| Abgaben für Gruppenarbeit (Frist, Sperre, Freischalten), siehe docs/lt4/abgaben.md | fertig |
| Seitenstatistik und veraltete Seiten, siehe docs/lt4/seitenstatistik.md | fertig |
| Webhooks für Discord und andere Dienste (pro Bereich), siehe docs/lt4/webhooks.md | fertig |
| SCIM 2.0: Konten und Gruppen aus Entra ID, Okta, Authentik abgleichen, siehe docs/lt4/scim.md | fertig |
| Confluence-Import (HTML-Export als ZIP, mit Seitenbaum und Anhängen), siehe docs/lt4/confluence-import.md | fertig |
| SSO (OIDC) | geplant |
| Bases (Inline-Datenbanken) | geplant |
| Kanban, Kalender | geplant |

## Updates von Docmost einspielen

```bash
git remote add upstream https://github.com/docmost/docmost.git   # einmalig
git fetch upstream
git merge upstream/main
# Konflikte entstehen meist nur bei Importzeilen "@/ee/…" -> "@/lt4/…".
# Neu hinzugekommene ee-Dateien oder -Importe wieder entfernen bzw. umbiegen.
```
