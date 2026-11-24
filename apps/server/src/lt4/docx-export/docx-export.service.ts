// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Seite als Word-Datei (.docx). Nutzt den MIT-lizenzierten ProseMirror-zu-DOCX-Serializer
// aus @docmost/editor-ext; Bilder werden aus dem eigenen Speicher eingebettet.
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page } from '@docmost/db/types/entity.types';
import { pageNodeToDocxBuffer } from '@docmost/editor-ext';
import { StorageService } from '../../integrations/storage/storage.service';
import { parseDocumentJson } from '../../collaboration/collaboration.util';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Titel als Überschrift voranstellen, damit die Word-Datei wie die Seite beginnt. */
export function withTitle(content: any, title?: string | null): any {
  const doc = content && content.type === 'doc' ? content : { type: 'doc', content: [] };
  const body = Array.isArray(doc.content) ? doc.content : [];
  const heading = title?.trim()
    ? [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title.trim() }] }]
    : [];
  const rest = body.length ? body : [{ type: 'paragraph' }];
  return { ...doc, content: [...heading, ...rest] };
}

@Injectable()
export class DocxExportService {
  private readonly logger = new Logger(DocxExportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
  ) {}

  /** Liest ein Bild nur, wenn es zu dieser Seite oder ihrem Bereich gehört. */
  private async readImage(page: Page, src: string): Promise<Uint8Array> {
    const id = String(src ?? '').match(UUID)?.[0];
    if (!id) return new Uint8Array();
    const att = await this.db
      .selectFrom('attachments')
      .select(['filePath', 'fileSize', 'pageId', 'spaceId'])
      .where('id', '=', id)
      .where('workspaceId', '=', page.workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!att || (att.pageId !== page.id && att.spaceId !== page.spaceId)) return new Uint8Array();
    if (Number(att.fileSize ?? 0) > MAX_IMAGE_BYTES) return new Uint8Array();
    try {
      return new Uint8Array(await this.storageService.read(att.filePath));
    } catch (err) {
      this.logger.debug(`DOCX: image ${id} not readable`);
      return new Uint8Array();
    }
  }

  async exportPage(page: Page): Promise<Buffer> {
    const { node } = parseDocumentJson(withTitle(page.content, page.title) as any);
    return pageNodeToDocxBuffer(node as any, (src: string) => this.readImage(page, src));
  }
}
