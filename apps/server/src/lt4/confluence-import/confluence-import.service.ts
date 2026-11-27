// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v7 } from 'uuid';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileTask, InsertablePage } from '@docmost/db/types/entity.types';
import { executeTx } from '@docmost/db/utils';
import { BacklinkRepo } from '@docmost/db/repos/backlink/backlink.repo';
import { generateSlugId } from '../../common/helpers';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { jsonToText } from '../../collaboration/collaboration.util';
import { EventName } from '../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ImportService } from '../../integrations/import/services/import.service';
import { ImportAttachmentService } from '../../integrations/import/services/import-attachment.service';
import { formatImportHtml } from '../../integrations/import/utils/import-formatter';
import { buildAttachmentCandidates } from '../../integrations/import/utils/import.utils';
import { PageService } from '../../core/page/services/page.service';
import {
  appendUnreferencedAttachments,
  ConfluencePage,
  convertConfluencePageHtml,
  scanConfluenceExport,
} from './confluence-export';

interface PlannedPage {
  id: string;
  slugId: string;
  title: string;
  parentPageId: string | null;
  position?: string;
  /** null = Sammelseite für einen Bereich (kein eigener Inhalt). */
  source: ConfluencePage | null;
  order: number;
  level: number;
}

/**
 * Confluence-Import (HTML-Export eines Bereichs als ZIP). Wird vom
 * FileImportTaskService des Kerns aufgerufen, wenn als Quelle "confluence"
 * gewählt wurde.
 */
@Injectable()
export class ConfluenceImportService {
  private readonly logger = new Logger(ConfluenceImportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly importService: ImportService,
    private readonly importAttachmentService: ImportAttachmentService,
    private readonly pageService: PageService,
    private readonly backlinkRepo: BacklinkRepo,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async processConfluenceImport(opts: {
    extractDir: string;
    fileTask: FileTask;
  }): Promise<void> {
    const { extractDir, fileTask } = opts;

    const spaces = await scanConfluenceExport(extractDir);
    const totalPages = spaces.reduce((n, s) => n + s.pages.length, 0);
    if (!totalPages) {
      throw new Error(
        'Keine Confluence-Seiten gefunden. Bitte in Confluence den Bereich als "HTML" exportieren und die ZIP-Datei unverändert hochladen.',
      );
    }

    const space = await this.db
      .selectFrom('spaces')
      .select(['slug'])
      .where('id', '=', fileTask.spaceId)
      .executeTakeFirst();

    // ---- Seiten planen (IDs, Eltern, Reihenfolge) ----
    const planned: PlannedPage[] = [];
    const plannedByFile = new Map<string, PlannedPage>();
    const multipleSpaces = spaces.length > 1;

    spaces.forEach((cfSpace, spaceIdx) => {
      let container: PlannedPage | null = null;
      if (multipleSpaces) {
        container = {
          id: v7(),
          slugId: generateSlugId(),
          title: cfSpace.name,
          parentPageId: null,
          source: null,
          order: spaceIdx,
          level: 0,
        };
        planned.push(container);
      }
      for (const page of cfSpace.pages) {
        const node: PlannedPage = {
          id: v7(),
          slugId: generateSlugId(),
          title: page.title,
          parentPageId: null,
          source: page,
          order: page.order,
          level: 0,
        };
        planned.push(node);
        plannedByFile.set(page.filePath, node);
      }
      for (const page of cfSpace.pages) {
        const node = plannedByFile.get(page.filePath)!;
        const parent = page.parentFilePath
          ? plannedByFile.get(page.parentFilePath)
          : null;
        node.parentPageId = parent?.id ?? container?.id ?? null;
      }
    });

    // Ebenen berechnen (Eltern vor Kindern einfügen)
    const byId = new Map(planned.map((p) => [p.id, p]));
    const levelOf = (p: PlannedPage): number => {
      let level = 0;
      let cur = p.parentPageId ? byId.get(p.parentPageId) : undefined;
      while (cur && level < 1000) {
        level++;
        cur = cur.parentPageId ? byId.get(cur.parentPageId) : undefined;
      }
      return level;
    };
    planned.forEach((p) => (p.level = levelOf(p)));

    // Positionen unter Geschwistern
    const siblings = new Map<string | null, PlannedPage[]>();
    for (const p of planned) {
      const list = siblings.get(p.parentPageId) ?? [];
      list.push(p);
      siblings.set(p.parentPageId, list);
    }
    for (const [parentId, list] of siblings) {
      list.sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title),
      );
      let prev: string | null = null;
      if (parentId === null) {
        const first = await this.pageService.nextPagePosition(fileTask.spaceId);
        list.forEach((p, idx) => {
          p.position = idx === 0 ? first : generateJitteredKeyBetween(prev, null);
          prev = p.position;
        });
      } else {
        for (const p of list) {
          p.position = generateJitteredKeyBetween(prev, null);
          prev = p.position;
        }
      }
    }

    // ---- Link-Kontext ----
    const pageFileById = new Map<string, string>();
    const pageFileByTitle = new Map<string, string>();
    const filePathToPageMetaMap = new Map<
      string,
      { id: string; title: string; slugId: string }
    >();
    for (const p of planned) {
      if (!p.source) continue;
      if (p.source.confluenceId) pageFileById.set(p.source.confluenceId, p.source.filePath);
      const key = p.title.toLowerCase();
      if (!pageFileByTitle.has(key)) pageFileByTitle.set(key, p.source.filePath);
      filePathToPageMetaMap.set(p.source.filePath, {
        id: p.id,
        title: p.title,
        slugId: p.slugId,
      });
    }

    const attachmentCandidates = await buildAttachmentCandidates(extractDir);
    const ordered = [...planned].sort((a, b) => a.level - b.level);

    const allBacklinks: any[] = [];
    const validPageIds = new Set<string>();
    const pageTitles = new Map<string, string>();

    try {
      await executeTx(this.db, async (trx) => {
        for (const p of ordered) {
          let html = '';
          let pageIcon: string | undefined;

          if (p.source) {
            const raw = await fs.readFile(
              path.join(extractDir, p.source.filePath),
              'utf-8',
            );
            const converted = convertConfluencePageHtml(raw, {
              currentFilePath: p.source.filePath,
              pageFileById,
              pageFileByTitle,
            });
            const withAttachments = appendUnreferencedAttachments(
              converted.html,
              p.source,
              converted.referencedPaths,
            );

            const withUploads =
              await this.importAttachmentService.processAttachments({
                html: withAttachments,
                pageRelativePath: p.source.filePath,
                extractDir,
                pageId: p.id,
                fileTask,
                attachmentCandidates,
                pageAttachments: p.source.attachments,
                isConfluenceImport: true,
              });

            const formatted = await formatImportHtml({
              html: withUploads,
              currentFilePath: p.source.filePath,
              filePathToPageMetaMap,
              creatorId: fileTask.creatorId,
              sourcePageId: p.id,
              workspaceId: fileTask.workspaceId,
              spaceSlug: space?.slug,
              spaceId: fileTask.spaceId,
            });
            html = formatted.html;
            pageIcon = formatted.pageIcon;
            allBacklinks.push(...formatted.backlinks);
          } else {
            html = '<div data-type="subpages"></div>';
          }

          const prosemirrorJson = getProsemirrorContent(
            await this.importService.processHTML(html, fileTask.spaceId),
          );

          const insertable: InsertablePage = {
            id: p.id,
            slugId: p.slugId,
            title: p.title,
            icon: pageIcon ?? null,
            content: prosemirrorJson,
            textContent: jsonToText(prosemirrorJson),
            ydoc: await this.importService.createYdoc(prosemirrorJson),
            position: p.position!,
            spaceId: fileTask.spaceId,
            workspaceId: fileTask.workspaceId,
            creatorId: fileTask.creatorId,
            lastUpdatedById: fileTask.creatorId,
            parentPageId: p.parentPageId,
          };
          await trx.insertInto('pages').values(insertable).execute();
          validPageIds.add(p.id);
          pageTitles.set(p.id, p.title);
        }

        const backlinks = allBacklinks.filter(
          (b) =>
            validPageIds.has(b.sourcePageId) &&
            validPageIds.has(b.targetPageId) &&
            b.sourcePageId !== b.targetPageId,
        );
        for (let i = 0; i < backlinks.length; i += 100) {
          await this.backlinkRepo.insertBacklink(backlinks.slice(i, i + 100), trx);
        }
      });
    } catch (error) {
      this.logger.error('Confluence-Import fehlgeschlagen', error);
      throw new Error(`Confluence-Import fehlgeschlagen: ${error?.['message']}`);
    }

    this.eventEmitter.emit(EventName.PAGE_CREATED, {
      pageIds: Array.from(validPageIds),
      workspaceId: fileTask.workspaceId,
    });

    this.auditService.logBatchWithContext(
      Array.from(validPageIds).map((pageId) => ({
        event: AuditEvent.PAGE_CREATED,
        resourceType: AuditResource.PAGE,
        resourceId: pageId,
        spaceId: fileTask.spaceId,
        metadata: {
          source: 'confluence',
          fileTaskId: fileTask.id,
          title: pageTitles.get(pageId),
        },
      })),
      {
        workspaceId: fileTask.workspaceId,
        actorId: fileTask.creatorId,
        actorType: 'user',
      },
    );

    this.logger.log(
      `Confluence-Import: ${validPageIds.size} Seiten aus ${spaces.length} Bereich(en) importiert`,
    );
  }
}
