// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Abgaben für Gruppenarbeit: eine Lehrkraft verteilt eine Vorlage an Gruppen,
// jede Gruppe bekommt eine eigene Seite mit Abgabefrist. Nach der Frist (oder
// nach "Abgeben") wird die Seite für die Gruppe nur noch lesbar.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_assignments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('template_id', 'uuid', (col) =>
      col.references('templates.id').onDelete('set null'),
    )
    // Sammelseite, unter der die Seiten der Gruppen liegen
    .addColumn('parent_page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('due_at', 'timestamptz', (col) => col.notNull())
    .addColumn('lock_after_due', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('allow_submit', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('creator_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('lt4_assignment_submissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('assignment_id', 'uuid', (col) =>
      col.notNull().references('lt4_assignments.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().unique().references('pages.id').onDelete('cascade'),
    )
    // Genau eins von beiden: Gruppe oder einzelne Person
    .addColumn('group_id', 'uuid', (col) => col.references('groups.id').onDelete('set null'))
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    // Eigene Frist (Verlängerung), sonst gilt die Frist der Abgabe
    .addColumn('due_at', 'timestamptz')
    // Freigeschaltet ohne neue Frist: wird nicht mehr automatisch gesperrt
    .addColumn('lock_disabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('submitted_at', 'timestamptz')
    .addColumn('submitted_by_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('locked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_lt4_assignment_submissions_assignment')
    .on('lt4_assignment_submissions')
    .column('assignment_id')
    .execute();
  await db.schema
    .createIndex('idx_lt4_assignments_workspace')
    .on('lt4_assignments')
    .columns(['workspace_id', 'created_at'])
    .execute();

  // Neues Rollenrecht "assignments": Rollen mit "settings" (Admins) bekommen es dazu.
  await sql`
    UPDATE lt4_roles
    SET permissions = (
      SELECT jsonb_agg(DISTINCT p)
      FROM jsonb_array_elements_text(permissions || '["assignments"]'::jsonb) AS p
    )
    WHERE jsonb_typeof(permissions) = 'array' AND permissions ? 'settings'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_assignment_submissions').execute();
  await db.schema.dropTable('lt4_assignments').execute();
}
