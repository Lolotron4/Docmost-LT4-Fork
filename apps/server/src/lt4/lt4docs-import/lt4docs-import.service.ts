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
import { generateSlugId, getMimeType } from '../../common/helpers';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import {
  jsonToText,
  parseDocumentJson,
} from '../../collaboration/collaboration.util';
import { EventName } from '../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ImportService } from '../../integrations/import/services/import.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { PageService } from '../../core/page/services/page.service';
import { getAttachmentFolderPath } from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import {
  Lt4DocsPage,
  NewAttachmentRef,
  orderParentsFirst,
  parseManifest,
  resolveInside,
  rewriteAttachmentRefs,
} from './lt4docs-format';

interface PlannedPage {
  sourceId: string | null;
  id: string;
  slugId: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  position?: string;
  order: number;
}

/**
 * Import von ".lt4docs"-Dateien aus dem LT4-Docs Client. Seiteninhalt liegt
 * schon im Editor-Format vor und wird verlustfrei übernommen (unbekannte
 * Knoten werden entfernt). Wird vom FileImportTaskService des Kerns
 * aufgerufen, wenn als Quelle "lt4docs" gewählt wurde.
 */
@Injectable()
export class Lt4DocsImportService {
  private readonly logger = new Logger(Lt4DocsImportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly importService: ImportService,
    private readonly storageService: StorageService,
    private readonly pageService: PageService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async processLt4DocsImport(opts: {
    extractDir: string;
    fileTask: FileTask;
  }): Promise<void> {
    const { extractDir, fileTask } = opts;

    const manifestPath = resolveInside(extractDir, 'manifest.json');
    let rawManifest: string;
    try {
      rawManifest = await fs.readFile(manifestPath!, 'utf-8');
    } catch {
      throw new Error(
        'Keine LT4-Docs-Datei: manifest.json fehlt. Bitte die .lt4docs-Datei unverändert hochladen.',
      );
    }
    const manifest = parseManifest(rawManifest);
    if (!manifest.pages.length) {
      throw new Error('Die LT4-Docs-Datei enthält keine Seiten.');
    }

    // ---- Seiten planen ----
    const planned: PlannedPage[] = [];
    const bySource = new Map<string, PlannedPage>();
    const multipleSpaces =
      new Set(manifest.pages.map((p) => p.spaceId)).size > 1;
    const containers = new Map<string, PlannedPage>();

    manifest.spaces.forEach((s, idx) => {
      if (!multipleSpaces) return;
      if (!manifest.pages.some((p) => p.spaceId === s.id)) return;
      const c: PlannedPage = {
        sourceId: null,
        id: v7(),
        slugId: generateSlugId(),
        title: s.name,
        icon: s.icon ?? null,
        parentId: null,
        order: idx,
      };
      containers.set(s.id, c);
      planned.push(c);
    });

    for (const p of orderParentsFirst<Lt4DocsPage>(manifest.pages)) {
      const node: PlannedPage = {
        sourceId: p.id,
        id: v7(),
        slugId: generateSlugId(),
        title: p.title,
        icon: p.icon ?? null,
        parentId: null,
        order: p.position,
      };
      bySource.set(p.id, node);
      planned.push(node);
    }
    for (const p of manifest.pages) {
      const node = bySource.get(p.id)!;
      node.parentId = p.parentId
        ? bySource.get(p.parentId)?.id ?? null
        : containers.get(p.spaceId)?.id ?? null;
    }

    // Positionen unter Geschwistern
    const siblings = new Map<string | null, PlannedPage[]>();
    for (const p of planned) {
      const list = siblings.get(p.parentId) ?? [];
      list.push(p);
      siblings.set(p.parentId, list);
    }
    for (const [parentId, list] of siblings) {
      list.sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title),
      );
      let prev: string | null = null;
      if (parentId === null) {
        prev = null;
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

    // ---- Anhänge hochladen ----
    const attachmentMap = new Map<string, NewAttachmentRef>();
    const uploadedRows: any[] = [];
    for (const a of manifest.attachments) {
      const target = bySource.get(a.pageId);
      if (!target) continue;
      const abs = resolveInside(extractDir, 'attachments', a.id, a.fileName);
      if (!abs) continue;
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(abs);
      } catch {
        this.logger.warn(`Anhang fehlt in der Datei: ${a.id}/${a.fileName}`);
        continue;
      }
      const newId = v7();
      const storageFilePath = `${getAttachmentFolderPath(
        AttachmentType.File,
        fileTask.workspaceId,
      )}/${newId}/${a.fileName}`;
      await this.storageService.upload(storageFilePath, buffer);
      uploadedRows.push({
        id: newId,
        filePath: storageFilePath,
        fileName: a.fileName,
        fileSize: buffer.length,
        mimeType: getMimeType(a.fileName),
        type: 'file',
        fileExt: path.extname(a.fileName).toLowerCase(),
        creatorId: fileTask.creatorId,
        workspaceId: fileTask.workspaceId,
        pageId: target.id,
        spaceId: fileTask.spaceId,
      });
      attachmentMap.set(a.id, { id: newId, fileName: a.fileName });
    }

    // ---- Seiten anlegen ----
    const validPageIds = new Set<string>();
    const pageTitles = new Map<string, string>();

    try {
      await executeTx(this.db, async (trx) => {
        for (const p of planned) {
          let json: any = null;
          if (p.sourceId) {
            const file = resolveInside(extractDir, 'pages', `${p.sourceId}.json`);
            try {
              json = JSON.parse(await fs.readFile(file!, 'utf-8'));
            } catch {
              json = null;
            }
          } else {
            json = { type: 'doc', content: [{ type: 'subpages' }] };
          }
          if (!json || json.type !== 'doc') {
            json = getProsemirrorContent(null);
          }
          json = rewriteAttachmentRefs(json, attachmentMap);
          // Unbekannte Knoten (z. B. aus neueren Client-Versionen) entfernen.
          const prosemirrorJson = parseDocumentJson(json).node.toJSON();

          const insertable: InsertablePage = {
            id: p.id,
            slugId: p.slugId,
            title: p.title,
            icon: p.icon,
            content: prosemirrorJson,
            textContent: jsonToText(prosemirrorJson),
            ydoc: await this.importService.createYdoc(prosemirrorJson),
            position: p.position!,
            spaceId: fileTask.spaceId,
            workspaceId: fileTask.workspaceId,
            creatorId: fileTask.creatorId,
            lastUpdatedById: fileTask.creatorId,
            parentPageId: p.parentId,
          };
          await trx.insertInto('pages').values(insertable).execute();
          validPageIds.add(p.id);
          pageTitles.set(p.id, p.title);
        }
        for (let i = 0; i < uploadedRows.length; i += 100) {
          await trx
            .insertInto('attachments')
            .values(uploadedRows.slice(i, i + 100))
            .execute();
        }
      });
    } catch (error) {
      this.logger.error('LT4-Docs-Import fehlgeschlagen', error);
      for (const row of uploadedRows) {
        await this.storageService.delete(row.filePath).catch(() => undefined);
      }
      throw new Error(`LT4-Docs-Import fehlgeschlagen: ${error?.['message']}`);
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
          source: 'lt4docs',
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
      `LT4-Docs-Import: ${validPageIds.size} Seiten, ${uploadedRows.length} Anhänge`,
    );
  }
}
