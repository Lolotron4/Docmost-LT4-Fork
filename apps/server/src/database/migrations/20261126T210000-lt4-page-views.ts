// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Seitenstatistik: Aufrufe pro Seite, Person und Tag (eine Zeile je Tag, mit Zähler).
// Dazu das neue Rollenrecht "page_stats" für Rollen, die das Audit-Log sehen dürfen.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_page_views')
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('day', 'date', (col) => col.notNull())
    .addColumn('views', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('last_viewed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('lt4_page_views_pkey', ['page_id', 'user_id', 'day'])
    .execute();

  await db.schema
    .createIndex('idx_lt4_page_views_page_day')
    .on('lt4_page_views')
    .columns(['page_id', 'day'])
    .execute();
  await db.schema
    .createIndex('idx_lt4_page_views_workspace_day')
    .on('lt4_page_views')
    .columns(['workspace_id', 'day'])
    .execute();

  await sql`
    UPDATE lt4_roles
    SET permissions = permissions || '["page_stats"]'::jsonb
    WHERE jsonb_typeof(permissions) = 'array'
      AND permissions ? 'audit'
      AND NOT permissions ? 'page_stats'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_page_views').execute();
}
