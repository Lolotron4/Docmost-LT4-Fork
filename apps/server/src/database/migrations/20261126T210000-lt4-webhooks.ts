// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Webhooks: Benachrichtigungen an Discord oder beliebige URLs bei Ereignissen
// (neue Seite, Kommentar, Seitenprüfung, Lesebestätigung ...), pro Bereich wählbar.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_webhooks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(100)', (col) => col.notNull())
    // 'discord' oder 'generic' (JSON an beliebige URL)
    .addColumn('type', 'varchar(20)', (col) => col.notNull().defaultTo('discord'))
    .addColumn('url', 'text', (col) => col.notNull())
    // Für 'generic': HMAC-Signatur der Nachricht
    .addColumn('secret', 'text')
    // NULL = alle Bereiche
    .addColumn('space_ids', sql`uuid[]`)
    .addColumn('events', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('language', 'varchar(5)', (col) => col.notNull().defaultTo('de'))
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('creator_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('last_sent_at', 'timestamptz')
    .addColumn('last_status', 'integer')
    .addColumn('last_error', 'text')
    .addColumn('failure_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_lt4_webhooks_workspace')
    .on('lt4_webhooks')
    .column('workspace_id')
    .execute();

  // Neues Einzelrecht "webhooks": Rollen mit "settings" bekommen es dazu,
  // damit sich für bestehende Rollen nichts ändert.
  await sql`
    UPDATE lt4_roles
    SET permissions = permissions || '["webhooks"]'::jsonb
    WHERE jsonb_typeof(permissions) = 'array'
      AND permissions ? 'settings'
      AND NOT permissions ? 'webhooks'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_webhooks').execute();
}
