// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// PDF-Dateien mit @docmost/pdf-inspector (MIT) Seite für Seite in Markdown und
// dann in HTML umwandeln. Eingebettete JPEG-Bilder werden Anhänge der Seite.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { markdownToHtml } from '@docmost/editor-ext';
import { ImportImageStoreService } from './import-image-store.service';

/** Sehr kleine Bilder (Linien, Logos-Schnipsel, Aufzählungszeichen) weglassen. */
const MIN_IMAGE_SIDE = 48;
/** Höchstens so viele Bilder pro Dokument übernehmen. */
const MAX_IMAGES = 200;

@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);

  constructor(private readonly images: ImportImageStoreService) {}

  async convertPdfToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const inspector = require('@docmost/pdf-inspector');
    const target = { workspaceId, spaceId, pageId, userId };

    let extraction: {
      pages: { page: number; markdown: string; needsOcr: boolean }[];
    };
    try {
      extraction = inspector.extractPagesMarkdown(fileBuffer);
    } catch (err: any) {
      this.logger.warn(`PDF konnte nicht gelesen werden: ${err?.message ?? err}`);
      throw new BadRequestException('The PDF file could not be read.');
    }

    // Bilder nach Seite (1-basiert) gruppieren
    const imagesByPage = new Map<number, string[]>();
    try {
      const extracted: {
        page: number;
        width: number;
        height: number;
        format: string;
        data: Buffer;
      }[] = inspector.extractImages(fileBuffer) ?? [];
      let count = 0;
      for (const img of extracted) {
        if (count >= MAX_IMAGES) break;
        if (img.width < MIN_IMAGE_SIDE || img.height < MIN_IMAGE_SIDE) continue;
        const mime = String(img.format).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
        count++;
        const src = await this.images.store(target, img.data, mime, `pdf-image-${count}`);
        if (!src) continue;
        const list = imagesByPage.get(img.page) ?? [];
        list.push(src);
        imagesByPage.set(img.page, list);
      }
    } catch (err: any) {
      // Bilder sind optional; der Text wird trotzdem importiert
      this.logger.warn(`PDF-Bilder übersprungen: ${err?.message ?? err}`);
    }

    const parts: string[] = [];
    let hasText = false;
    const pages = [...(extraction.pages ?? [])].sort((a, b) => a.page - b.page);
    for (const p of pages) {
      const md = (p.markdown ?? '').trim();
      if (md) {
        hasText = true;
        parts.push(await markdownToHtml(md));
      }
      for (const src of imagesByPage.get(p.page + 1) ?? []) {
        parts.push(`<img src="${src}" alt="">`);
      }
    }

    if (!hasText && imagesByPage.size === 0) {
      throw new BadRequestException(
        'No text found in this PDF. Scanned PDFs without a text layer cannot be imported.',
      );
    }
    if (!hasText) {
      parts.unshift(
        '<p><em>This PDF has no text layer (probably a scan). Only the images were imported.</em></p>',
      );
    }

    return parts.join('\n');
  }
}
