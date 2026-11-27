// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// SCIM 2.0: Konten und Gruppen aus einem Identitätsanbieter (Entra ID, Okta,
// Authentik ...) abgleichen. Die Kern-Tabellen scim_tokens und die Spalten
// scim_external_id gibt es schon; hier nur, was LT4 zusätzlich merkt.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_scim_users')
    .ifNotExists()
    .addColumn('user_id', 'uuid', (col) =>
      col.primaryKey().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    // userName so, wie der Anbieter ihn schickt (muss unverändert zurückkommen)
    .addColumn('user_name', 'text', (col) => col.notNull())
    .addColumn('given_name', 'text')
    .addColumn('family_name', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lt4_scim_users_user_name
    ON lt4_scim_users (workspace_id, lower(user_name))
  `.execute(db);

  // Neues Einzelrecht "scim". SCIM kann Konten anlegen und Gruppen (mit
  // Gruppen-Rollen) füllen, darum bekommen es nur Rollen, die schon
  // Sicherungen dürfen (also Owner-nahe Rollen).
  await sql`
    UPDATE lt4_roles
    SET permissions = permissions || '["scim"]'::jsonb
    WHERE jsonb_typeof(permissions) = 'array'
      AND permissions ? 'backups'
      AND NOT permissions ? 'scim'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_scim_users').ifExists().execute();
}
