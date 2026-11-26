// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Aufgaben: zugewiesene Checkbox-Einträge aus Seiten (eine Zeile pro Eintrag und Person).
// Die Tabelle ist ein Index des Seiteninhalts und wird beim Speichern einer Seite abgeglichen.
import { Kysely, sql } from 'kysely';
import { extractTasks } from '../../lt4/tasks/task-extract';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('lt4_tasks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('item_id', 'varchar', (col) => col.notNull())
    .addColumn('assignee_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('assigned_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('text', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('checked', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('due_date', 'date')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('assigned_notified_at', 'timestamptz')
    .addColumn('due_soon_notified_at', 'timestamptz')
    .addColumn('overdue_notified_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('lt4_tasks_page_item_assignee', ['page_id', 'item_id', 'assignee_id'])
    .execute();

  await db.schema
    .createIndex('idx_lt4_tasks_assignee')
    .on('lt4_tasks')
    .columns(['assignee_id', 'checked'])
    .execute();
  await db.schema
    .createIndex('idx_lt4_tasks_assigned_by')
    .on('lt4_tasks')
    .column('assigned_by_id')
    .execute();

  // Vorhandene Seiten einlesen. Ohne Benachrichtigung (alles gilt als schon gemeldet),
  // damit nach dem Update keine Flut alter Erinnerungen kommt.
  const pages = await db
    .selectFrom('pages')
    .select(['id', 'space_id', 'workspace_id', 'content'])
    .where('deleted_at', 'is', null)
    .where(sql<boolean>`content::text like '%"taskItem"%'`)
    .where(sql<boolean>`content::text like '%"mention"%'`)
    .execute();

  const today = new Date().toISOString().slice(0, 10);
  const users = new Set(
    (await db.selectFrom('users').select('id').execute()).map((u: any) => u.id),
  );
  // Mit und ohne CamelCasePlugin lauffähig: snake_case schreiben, beide Schreibweisen lesen
  for (const page of pages as any[]) {
    const spaceId = page.spaceId ?? page.space_id;
    const workspaceId = page.workspaceId ?? page.workspace_id;
    let tasks;
    try {
      tasks = extractTasks(page.content);
    } catch {
      continue;
    }
    const rows = [];
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!users.has(a.userId)) continue;
        const past = t.dueDate && t.dueDate <= today;
        rows.push({
          workspace_id: workspaceId,
          space_id: spaceId,
          page_id: page.id,
          item_id: t.itemId,
          assignee_id: a.userId,
          assigned_by_id: a.assignedById && users.has(a.assignedById) ? a.assignedById : null,
          text: t.text,
          checked: t.checked,
          due_date: t.dueDate,
          completed_at: t.checked ? new Date() : null,
          assigned_notified_at: new Date(),
          due_soon_notified_at: past ? new Date() : null,
          overdue_notified_at: past ? new Date() : null,
        });
      }
    }
    if (rows.length) {
      await db
        .insertInto('lt4_tasks')
        .values(rows)
        .onConflict((oc) => oc.columns(['page_id', 'item_id', 'assignee_id']).doNothing())
        .execute();
    }
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('lt4_tasks').execute();
}
