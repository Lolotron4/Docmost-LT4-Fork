// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Lesebestätigung: Seiten, deren Lesen bestätigt werden soll, und die Bestätigungen.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_read_requests')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().unique().references('pages.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('requested_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('message', 'text')
    .addColumn('due_at', 'timestamptz')
    // Bestätigungen vor diesem Zeitpunkt zählen nicht (erneut anfordern)
    .addColumn('round_started_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('lt4_read_confirmations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('request_id', 'uuid', (col) =>
      col.notNull().references('lt4_read_requests.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('confirmed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('lt4_read_confirmations_request_user', ['request_id', 'user_id'])
    .execute();

  await db.schema
    .createIndex('idx_lt4_read_requests_space')
    .on('lt4_read_requests')
    .column('space_id')
    .execute();
  await db.schema
    .createIndex('idx_lt4_read_confirmations_user')
    .on('lt4_read_confirmations')
    .column('user_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_read_confirmations').execute();
  await db.schema.dropTable('lt4_read_requests').execute();
}
