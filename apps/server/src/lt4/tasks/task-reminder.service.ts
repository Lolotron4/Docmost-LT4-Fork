// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Verschickt In-App-Benachrichtigungen für Aufgaben:
//  - "Aufgabe zugewiesen", sobald eine Zuweisung gespeichert wurde
//  - "morgen/heute fällig" einmal am Tag vor bzw. am Fälligkeitstag
//  - "überfällig" einmal am Tag nach der Fälligkeit
// Erinnerungen gehen erst ab 7 Uhr (Zeitzone der Person) raus.
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { NotificationService } from '../../core/notification/notification.service';

export const TASK_ASSIGNED_NOTIFICATION = 'lt4.task_assigned';
export const TASK_DUE_NOTIFICATION = 'lt4.task_due';

const INTERVAL_MS = 30 * 1000;
const REMIND_FROM_HOUR = 7;

/** Datum (YYYY-MM-DD) und Stunde in einer Zeitzone. */
export function localDay(date: Date, timeZone?: string | null): { day: string; hour: number } {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone || 'Europe/Berlin');
  } catch {
    parts = fmt('Europe/Berlin');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class TaskReminderService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TaskReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.tick(), 5000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifyAssigned();
      await this.notifyDue();
    } catch (err) {
      this.logger.error(`Aufgaben-Erinnerungen fehlgeschlagen: ${err}`);
    } finally {
      this.running = false;
    }
  }

  /** Darf die Person die Seite (noch) sehen? */
  private async hasAccess(userId: string, pageId: string, spaceId: string) {
    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess([userId], spaceId);
    if (!inSpace.has(userId)) return false;
    const ok = await this.pagePermissionRepo.getUserIdsWithPageAccess(pageId, [userId]);
    return ok.includes(userId);
  }

  private async notifyAssigned() {
    const rows = await this.db
      .selectFrom('lt4Tasks as t')
      .innerJoin('pages as p', 'p.id', 't.pageId')
      .innerJoin('users as u', 'u.id', 't.assigneeId')
      .select([
        't.id',
        't.pageId',
        't.workspaceId',
        't.assigneeId',
        't.assignedById',
        't.text',
        sql<string | null>`t.due_date::text`.as('dueDate'),
        'p.spaceId',
        'u.timezone',
      ])
      .where('t.assignedNotifiedAt', 'is', null)
      .where('t.checked', '=', false)
      .where('p.deletedAt', 'is', null)
      .limit(200)
      .execute();

    for (const r of rows) {
      // Erst markieren, damit nichts doppelt rausgeht. Die Zuweisung nennt die
      // Fälligkeit schon, also keine zusätzliche "morgen/heute fällig"-Meldung direkt danach.
      const now = new Date();
      const { day: today } = localDay(now, r.timezone);
      const covered = r.dueDate && r.dueDate <= addDays(today, 1);
      await this.db
        .updateTable('lt4Tasks')
        .set({
          assignedNotifiedAt: now,
          ...(covered ? { dueSoonNotifiedAt: now } : {}),
          ...(covered && r.dueDate! < today ? { overdueNotifiedAt: now } : {}),
        })
        .where('id', '=', r.id)
        .execute();
      try {
        if (!(await this.hasAccess(r.assigneeId, r.pageId, r.spaceId))) continue;
        await this.notificationService.create({
          userId: r.assigneeId,
          workspaceId: r.workspaceId,
          type: TASK_ASSIGNED_NOTIFICATION,
          actorId: r.assignedById,
          pageId: r.pageId,
          spaceId: r.spaceId,
          data: { taskId: r.id, text: r.text.slice(0, 200), dueDate: r.dueDate },
        });
      } catch (err) {
        this.logger.warn(`Benachrichtigung fehlgeschlagen: ${err}`);
      }
    }
  }

  private async notifyDue() {
    const now = new Date();
    // Grobe Vorauswahl in UTC (+/- 1 Tag Puffer für Zeitzonen), genaue Prüfung pro Person
    const utcToday = now.toISOString().slice(0, 10);
    const rows = await this.db
      .selectFrom('lt4Tasks as t')
      .innerJoin('pages as p', 'p.id', 't.pageId')
      .innerJoin('users as u', 'u.id', 't.assigneeId')
      .select([
        't.id',
        't.pageId',
        't.workspaceId',
        't.assigneeId',
        't.assignedById',
        't.text',
        't.dueSoonNotifiedAt',
        't.overdueNotifiedAt',
        sql<string>`t.due_date::text`.as('dueDate'),
        'p.spaceId',
        'u.timezone',
      ])
      .where('t.checked', '=', false)
      .where('t.dueDate', 'is not', null)
      .where('p.deletedAt', 'is', null)
      .where('t.dueDate', '<=', addDays(utcToday, 2) as any)
      // Uralte Fälligkeiten nicht mehr melden
      .where('t.dueDate', '>=', addDays(utcToday, -8) as any)
      .where((eb) =>
        eb.or([eb('t.dueSoonNotifiedAt', 'is', null), eb('t.overdueNotifiedAt', 'is', null)]),
      )
      .limit(500)
      .execute();

    for (const r of rows) {
      const { day: today, hour } = localDay(now, r.timezone);
      if (hour < REMIND_FROM_HOUR) continue;
      let kind: 'tomorrow' | 'today' | 'overdue' | null = null;
      const patch: Record<string, Date> = {};
      if (r.dueDate < today) {
        if (!r.overdueNotifiedAt) {
          kind = 'overdue';
          patch.overdueNotifiedAt = now;
          if (!r.dueSoonNotifiedAt) patch.dueSoonNotifiedAt = now;
        }
      } else if (r.dueDate === today || r.dueDate === addDays(today, 1)) {
        if (!r.dueSoonNotifiedAt) {
          kind = r.dueDate === today ? 'today' : 'tomorrow';
          patch.dueSoonNotifiedAt = now;
        }
      }
      if (!kind) continue;
      await this.db.updateTable('lt4Tasks').set(patch).where('id', '=', r.id).execute();
      try {
        if (!(await this.hasAccess(r.assigneeId, r.pageId, r.spaceId))) continue;
        await this.notificationService.create({
          userId: r.assigneeId,
          workspaceId: r.workspaceId,
          type: TASK_DUE_NOTIFICATION,
          actorId: null,
          pageId: r.pageId,
          spaceId: r.spaceId,
          data: { taskId: r.id, text: r.text.slice(0, 200), dueDate: r.dueDate, kind },
        });
      } catch (err) {
        this.logger.warn(`Erinnerung fehlgeschlagen: ${err}`);
      }
    }
  }
}
