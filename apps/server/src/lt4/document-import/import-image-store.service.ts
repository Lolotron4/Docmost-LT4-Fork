// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Speichert Bilder aus importierten Word-/PDF-Dateien als Anhänge der neuen Seite.
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { v7 } from 'uuid';
import { StorageService } from '../../integrations/storage/storage.service';
import { getAttachmentFolderPath } from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';

export type ImportTarget = {
  workspaceId: string;
  spaceId: string;
  pageId: string;
  userId: string;
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
};

/** Größte Bilddatei, die beim Import übernommen wird. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class ImportImageStoreService {
  private readonly logger = new Logger(ImportImageStoreService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
  ) {}

  /** Lädt ein Bild hoch und gibt die URL für das <img src> zurück (oder null). */
  async store(
    target: ImportTarget,
    data: Buffer,
    mimeType: string,
    baseName = 'image',
  ): Promise<string | null> {
    const mime = (mimeType || '').toLowerCase();
    const ext = EXT_BY_MIME[mime];
    if (!ext || !data?.length || data.length > MAX_IMAGE_BYTES) return null;

    const id = v7();
    const fileName = `${baseName.replace(/[^a-zA-Z0-9_-]/g, '') || 'image'}${ext}`;
    const filePath = `${getAttachmentFolderPath(
      AttachmentType.File,
      target.workspaceId,
    )}/${id}/${fileName}`;

    try {
      await this.storageService.upload(filePath, data);
      await this.db
        .insertInto('attachments')
        .values({
          id,
          filePath,
          fileName,
          fileSize: data.length,
          mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime,
          type: 'file',
          fileExt: ext,
          creatorId: target.userId,
          workspaceId: target.workspaceId,
          spaceId: target.spaceId,
          pageId: target.pageId,
        })
        .execute();
      return `/api/files/${id}/${fileName}`;
    } catch (err: any) {
      this.logger.warn(`Bild konnte nicht gespeichert werden: ${err?.message ?? err}`);
      return null;
    }
  }
}
