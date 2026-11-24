// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Word-Dateien (.docx) mit mammoth (MIT) in HTML umwandeln; Bilder werden Anhänge.
import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { ImportImageStoreService } from './import-image-store.service';

// Word-Formatvorlagen (auch deutsche Namen) auf passende HTML-Elemente abbilden
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Titel'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Untertitel'] => h2:fresh",
  "p[style-name='Überschrift 1'] => h1:fresh",
  "p[style-name='Überschrift 2'] => h2:fresh",
  "p[style-name='Überschrift 3'] => h3:fresh",
  "p[style-name='Überschrift 4'] => h4:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Zitat'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p[style-name='Intensives Zitat'] => blockquote:fresh",
  "p[style-name='Code'] => pre:separator('\\n')",
  "r[style-name='Code'] => code",
  'u => u',
  'strike => s',
  'highlight => mark',
];

@Injectable()
export class DocxImportService {
  constructor(private readonly images: ImportImageStoreService) {}

  async convertDocxToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const target = { workspaceId, spaceId, pageId, userId };
    let counter = 0;

    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        styleMap: STYLE_MAP,
        // Verknüpfte externe Dateien nie vom Server lesen
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async (image) => {
          counter++;
          const data = await image.readAsBuffer();
          const src = await this.images.store(
            target,
            data,
            image.contentType,
            `image-${counter}`,
          );
          // Nicht unterstützte Bildformate (z. B. EMF) werden weggelassen
          // mammoth übernimmt den Alternativtext selbst
          return { src: src ?? '' };
        }),
      },
    );

    // Leere <img src=""> (übersprungene Bilder) entfernen
    return (
      result.value
        .replace(/<img[^>]*src=""[^>]*\/?>/g, '')
        // Absätze, die nur ein Bild enthalten, auflösen (sonst bleibt ein leerer Absatz stehen)
        .replace(/<p>\s*(<img[^>]*>)\s*<\/p>/g, '$1')
        .replace(/<p>\s*<\/p>/g, '')
    );
  }
}
