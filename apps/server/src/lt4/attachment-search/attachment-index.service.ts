// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Liest den Text aus angehängten PDF-, Word- und Textdateien und legt ihn für die
// Volltextsuche ab (attachments.text_content / tsv aus dem Core-Schema).
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import * as mammoth from 'mammoth';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import { QueueJob, QueueName } from '../../integrations/queue/constants';

/** Dateitypen, deren Text durchsucht wird. */
export const INDEXABLE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv'];
/** Größere Dateien werden nicht gelesen. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** So viel Text wird höchstens gespeichert. */
const MAX_TEXT_CHARS = 1_000_000;

@Injectable()
export class AttachmentIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttachmentIndexService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private readonly queue: Queue,
  ) {}

  /** Beim Start einmal alle noch nicht gelesenen Anhänge nachholen. */
  async onApplicationBootstrap() {
    setTimeout(() => this.queueBackfill().catch(() => undefined), 30_000).unref?.();
  }

  async queueBackfill() {
    const rows = await this.db
      .selectFrom('attachments')
      .select('workspaceId')
      .distinct()
      .where('indexedAt', 'is', null)
      .where('deletedAt', 'is', null)
      .where('pageId', 'is not', null)
      .where(sql<boolean>`lower(file_ext) in (${sql.join(INDEXABLE_EXTENSIONS)})`)
      .execute();
    for (const r of rows) {
      await this.queue.add(
        QueueJob.ATTACHMENT_INDEXING,
        { workspaceId: r.workspaceId },
        { jobId: `lt4-attachment-backfill-${r.workspaceId}`, removeOnComplete: true, removeOnFail: true },
      );
    }
  }

  /** Text eines Anhangs lesen und speichern. */
  async indexAttachment(attachmentId: string): Promise<void> {
    const att = await this.db
      .selectFrom('attachments')
      .select(['id', 'filePath', 'fileExt', 'fileSize', 'deletedAt'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    if (!att || att.deletedAt) return;

    const ext = (att.fileExt ?? '').toLowerCase();
    let text = '';
    if (INDEXABLE_EXTENSIONS.includes(ext) && Number(att.fileSize ?? 0) <= MAX_FILE_BYTES) {
      try {
        const buffer = await this.storageService.read(att.filePath);
        text = await this.extractText(buffer, ext);
      } catch (err: any) {
        this.logger.debug(`Anhang ${attachmentId} nicht lesbar: ${err?.message ?? err}`);
      }
    }
    text = text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);

    // indexed_at wird auch bei leerem Text gesetzt, damit nichts endlos wiederholt wird
    await this.db
      .updateTable('attachments')
      .set({
        textContent: text || null,
        tsv: text
          ? sql`to_tsvector('english', f_unaccent(${text}))`
          : null,
        indexedAt: new Date(),
      } as any)
      .where('id', '=', attachmentId)
      .execute();
  }

  /** Alle noch nicht gelesenen Anhänge eines Workspaces lesen. */
  async indexAttachments(workspaceId: string): Promise<void> {
    for (;;) {
      const batch = await this.db
        .selectFrom('attachments')
        .select('id')
        .where('workspaceId', '=', workspaceId)
        .where('indexedAt', 'is', null)
        .where('deletedAt', 'is', null)
        .where('pageId', 'is not', null)
        .where(sql<boolean>`lower(file_ext) in (${sql.join(INDEXABLE_EXTENSIONS)})`)
        .limit(50)
        .execute();
      if (batch.length === 0) return;
      for (const a of batch) await this.indexAttachment(a.id);
    }
  }

  private async extractText(buffer: Buffer, ext: string): Promise<string> {
    if (ext === '.pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const inspector = require('@docmost/pdf-inspector');
      return inspector.extractText(buffer) ?? '';
    }
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    }
    return buffer.toString('utf8');
  }
}
