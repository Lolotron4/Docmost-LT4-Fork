// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Gastlinks: Ablaufdatum und Passwort für öffentliche Freigaben (shares).
// Eigene Tabelle statt neuer Spalten in shares, damit der Kern unverändert bleibt.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_share_settings')
    .addColumn('share_id', 'uuid', (col) =>
      col.primaryKey().references('shares.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('expires_at', 'timestamptz')
    .addColumn('password_hash', 'varchar')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Neues Rollenrecht: Regeln für Gastlinks umgehen. Rollen mit "settings"
  // bekommen es dazu, damit Admin-ähnliche Rollen nicht eingeschränkt werden.
  await sql`
    UPDATE lt4_roles
    SET permissions = (
      SELECT jsonb_agg(DISTINCT p)
      FROM jsonb_array_elements_text(
        permissions || '["shares_unrestricted"]'::jsonb
      ) AS p
    )
    WHERE jsonb_typeof(permissions) = 'array' AND permissions ? 'settings'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_share_settings').execute();
}
