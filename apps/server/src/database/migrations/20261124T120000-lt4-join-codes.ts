// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Beitrittslinks mit Registrierungscode (Selbstregistrierung ohne Einladungs-Mail).
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_join_codes')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('code', 'varchar', (col) => col.notNull().unique())
    .addColumn('role', 'varchar', (col) => col.notNull().defaultTo('member'))
    .addColumn('max_uses', 'integer', (col) => col)
    .addColumn('use_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('expires_at', 'timestamptz', (col) => col)
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('revoked_at', 'timestamptz', (col) => col)
    .execute();

  await db.schema
    .createIndex('lt4_join_codes_workspace_id_idx')
    .on('lt4_join_codes')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_join_codes').execute();
}
