// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Neues Recht "Vorlagen erstellen": Rollen mit "Vorlagen verwalten" bekommen es dazu.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE lt4_roles
    SET permissions = permissions || '["templates_create"]'::jsonb
    WHERE jsonb_typeof(permissions) = 'array'
      AND permissions ? 'templates'
      AND NOT permissions ? 'templates_create'
  `.execute(db);
}

export async function down(): Promise<void> {
  // nichts zu tun
}
