// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Prüft regelmäßig, welche Seitenprüfungen bald ablaufen oder abgelaufen sind,
// und stößt die (im Kern vorhandenen) Benachrichtigungen an. Doppelte
// Benachrichtigungen verhindert der Kern selbst.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { EXPIRING_SOON_DAYS } from './page-verification.service';

const SCHEDULER_ID = 'lt4-page-verification-reconcile';
const INTERVAL_MS = 30 * 60 * 1000;

@Injectable()
export class PageVerificationSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PageVerificationSchedulerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.notificationQueue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: INTERVAL_MS },
        { name: QueueJob.VERIFICATION_RECONCILE, data: {} },
      );
    } catch (err) {
      this.logger.error(`Scheduler konnte nicht angelegt werden: ${err}`);
    }
  }

  /** Wird vom Notification-Prozessor für VERIFICATION_RECONCILE aufgerufen. */
  async reconcile(): Promise<void> {
    const now = new Date();
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400_000);
    // Abgelaufene nur innerhalb der letzten 3 Tage melden, nicht uralte
    const recent = new Date(now.getTime() - 3 * 86400_000);

    const rows = await this.db
      .selectFrom('pageVerifications')
      .select(['id', 'expiresAt'])
      .where('type', '=', 'expiring')
      .where('invalidatedAt', 'is', null)
      .where('verifiedAt', 'is not', null)
      .where('expiresAt', 'is not', null)
      .where('expiresAt', '<=', soon)
      .where('expiresAt', '>', recent)
      .limit(1000)
      .execute();

    for (const row of rows) {
      const expired = new Date(row.expiresAt!).getTime() <= now.getTime();
      await this.notificationQueue.add(
        expired ? QueueJob.PAGE_VERIFICATION_EXPIRED : QueueJob.PAGE_VERIFICATION_EXPIRING,
        { verificationId: row.id },
        { removeOnComplete: true },
      );
    }
    if (rows.length) this.logger.debug(`${rows.length} Seitenprüfungen zur Erinnerung eingereiht`);
  }
}
