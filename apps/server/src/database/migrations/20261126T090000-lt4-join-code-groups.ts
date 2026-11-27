// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Beitrittslinks: Gruppen, in die neue Konten automatisch aufgenommen werden.
// Bestehende Links bekommen NULL (= keine zusätzlichen Gruppen) und laufen weiter.
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('lt4_join_codes')
    .addColumn('group_ids', sql`uuid[]`, (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('lt4_join_codes').dropColumn('group_ids').execute();
}
