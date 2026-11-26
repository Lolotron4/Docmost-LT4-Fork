// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Gleicht die Aufgaben-Tabelle mit dem Seiteninhalt ab (wird beim Speichern einer
// Seite aufgerufen). Benachrichtigungen verschickt der TaskReminderService.
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { ExtractedTask, extractTasks } from './task-extract';

@Injectable()
export class TaskSyncService {
  private readonly logger = new Logger(TaskSyncService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /** Liefert die extrahierten Aufgaben (z. B. um Erwähnungs-Benachrichtigungen zu filtern). */
  async syncPage(
    page: { id: string; spaceId: string; workspaceId: string },
    content: unknown,
  ): Promise<ExtractedTask[]> {
    let tasks: ExtractedTask[] = [];
    try {
      tasks = extractTasks(content);
    } catch (err) {
      this.logger.warn(`Aufgaben konnten nicht gelesen werden (${page.id}): ${err}`);
      return [];
    }
    try {
      await this.apply(page, tasks);
    } catch (err) {
      this.logger.error(`Aufgaben-Abgleich fehlgeschlagen (${page.id}): ${err}`);
    }
    return tasks;
  }

  private async apply(
    page: { id: string; spaceId: string; workspaceId: string },
    tasks: ExtractedTask[],
  ) {
    const existing = await this.db
      .selectFrom('lt4Tasks')
      .select([
        'id',
        'itemId',
        'assigneeId',
        'text',
        'checked',
        'spaceId',
        sql<string | null>`due_date::text`.as('dueDate'),
      ])
      .where('pageId', '=', page.id)
      .execute();
    if (tasks.length === 0 && existing.length === 0) return;

    const byKey = new Map(existing.map((e) => [`${e.itemId}|${e.assigneeId}`, e]));
    const keep = new Set<string>();
    const candidateUsers = [
      ...new Set(
        tasks.flatMap((t) =>
          t.assignees.flatMap((a) => (a.assignedById ? [a.userId, a.assignedById] : [a.userId])),
        ),
      ),
    ];
    const validUsers = new Set(
      candidateUsers.length
        ? (
            await this.db
              .selectFrom('users')
              .select('id')
              .where('id', 'in', candidateUsers)
              .where('workspaceId', '=', page.workspaceId)
              .where('deletedAt', 'is', null)
              .execute()
          ).map((u) => u.id)
        : [],
    );
    const now = new Date();

    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!validUsers.has(a.userId)) continue;
        const key = `${t.itemId}|${a.userId}`;
        keep.add(key);
        const old = byKey.get(key);
        if (old) {
          const dueChanged = (old.dueDate ?? null) !== t.dueDate;
          if (
            old.text === t.text &&
            old.checked === t.checked &&
            !dueChanged &&
            old.spaceId === page.spaceId
          ) {
            continue;
          }
          await this.db
            .updateTable('lt4Tasks')
            .set({
              text: t.text,
              checked: t.checked,
              dueDate: t.dueDate,
              spaceId: page.spaceId,
              updatedAt: now,
              ...(old.checked !== t.checked ? { completedAt: t.checked ? now : null } : {}),
              // Neue Fälligkeit = Erinnerungen neu
              ...(dueChanged ? { dueSoonNotifiedAt: null, overdueNotifiedAt: null } : {}),
            })
            .where('id', '=', old.id)
            .execute();
        } else {
          const selfAssigned = a.assignedById === a.userId;
          await this.db
            .insertInto('lt4Tasks')
            .values({
              workspaceId: page.workspaceId,
              spaceId: page.spaceId,
              pageId: page.id,
              itemId: t.itemId,
              assigneeId: a.userId,
              assignedById:
                a.assignedById && validUsers.has(a.assignedById) ? a.assignedById : null,
              text: t.text,
              checked: t.checked,
              dueDate: t.dueDate,
              completedAt: t.checked ? now : null,
              // Sich selbst zugewiesene oder schon erledigte Aufgaben nicht melden
              assignedNotifiedAt: selfAssigned || t.checked ? now : null,
            })
            .onConflict((oc) => oc.columns(['pageId', 'itemId', 'assigneeId']).doNothing())
            .execute();
        }
      }
    }

    const remove = existing.filter((e) => !keep.has(`${e.itemId}|${e.assigneeId}`)).map((e) => e.id);
    if (remove.length) {
      await this.db.deleteFrom('lt4Tasks').where('id', 'in', remove).execute();
    }
  }
}
