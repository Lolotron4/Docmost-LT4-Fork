// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// KI-Schreibassistent: Nutzung auf bestimmte Gruppen und Personen beschränken.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('lt4_ai_settings')
    .addColumn('access', 'varchar', (col) => col.notNull().defaultTo('all'))
    .addColumn('allowed_group_ids', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('allowed_user_ids', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('lt4_ai_settings')
    .dropColumn('access')
    .dropColumn('allowed_group_ids')
    .dropColumn('allowed_user_ids')
    .execute();
}
