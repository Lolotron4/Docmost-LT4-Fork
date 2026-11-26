// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Neue Einzelrechte (Ankündigungen, Vorlagen, KI verwalten, KI nutzen). Bisher waren
// sie Teil von "settings": Rollen, die "settings" hatten, bekommen sie dazu,
// damit sich für bestehende Rollen nichts ändert.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Frühe Testversion hat die Rechte als JSON-Text statt als Array gespeichert.
  await sql`
    UPDATE lt4_roles
    SET permissions = (permissions #>> '{}')::jsonb
    WHERE jsonb_typeof(permissions) = 'string'
  `.execute(db);

  await sql`
    UPDATE lt4_roles
    SET permissions = (
      SELECT jsonb_agg(DISTINCT p)
      FROM jsonb_array_elements_text(
        permissions || '["announcements","templates","ai_manage","ai_use"]'::jsonb
      ) AS p
    )
    WHERE jsonb_typeof(permissions) = 'array' AND permissions ? 'settings'
  `.execute(db);
}

export async function down(): Promise<void> {
  // nichts zu tun: zusätzliche Rechte stören ältere Versionen nicht
}
