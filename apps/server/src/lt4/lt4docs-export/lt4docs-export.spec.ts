import * as JSZip from 'jszip';
import { buildLt4DocsZip, numericPositions } from './lt4docs-export';
import { parseManifest } from '../lt4docs-import/lt4docs-format';

const S = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const ATT = '55555555-5555-4555-8555-555555555555';
const HIDDEN = '66666666-6666-4666-8666-666666666666';

const page = (id: string, parentPageId: string | null, position: string, content: any) => ({
  id,
  spaceId: S,
  parentPageId,
  title: id === A ? 'Start' : 'Seite',
  icon: null,
  position,
  content,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-02T10:00:00Z'),
});

const img = (id: string) => ({
  type: 'image',
  attrs: { src: `/api/files/${id}/bild.png`, attachmentId: id },
});

async function streamToBuffer(s: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on('data', (c: any) => chunks.push(Buffer.from(c)));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
  });
}

describe('lt4docs-export', () => {
  it('rechnet Bruchindizes in Reihenfolge je Ebene um', () => {
    const pos = numericPositions([
      page(B, null, 'a1', null),
      page(A, null, 'a0', null),
      page(C, A, 'Zz', null),
    ] as any);
    expect(pos.get(A)).toBe(0);
    expect(pos.get(B)).toBe(1);
    expect(pos.get(C)).toBe(0);
  });

  it('erzeugt eine Datei, die der Import wieder lesen kann', async () => {
    const docA = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo' }] }, img(ATT), img(HIDDEN)] };
    const stream = await buildLt4DocsZip({
      space: { id: S, name: 'Klasse 9b' },
      pages: [page(A, null, 'a0', docA), page(C, A, 'a0', JSON.stringify({ type: 'doc', content: [] })), page(B, 'fehlt', 'a1', null)],
      attachments: new Map([[ATT, { id: ATT, fileName: '../bild.png', filePath: 'x/bild.png', pageId: A }]]),
      readFile: async () => Buffer.from('PNG'),
      generator: 'test',
    });
    const zip = await JSZip.loadAsync(await streamToBuffer(stream));
    const manifest = parseManifest(await zip.file('manifest.json')!.async('string'));
    expect(manifest.spaces).toEqual([{ id: S, name: 'Klasse 9b', icon: null }]);
    expect(manifest.pages.map((p) => [p.id, p.parentId])).toEqual([[A, null], [C, A], [B, null]]);
    expect(manifest.attachments).toEqual([
      expect.objectContaining({ id: ATT, pageId: A, fileName: 'bild.png' }),
    ]);
    expect(await zip.file(`attachments/${ATT}/bild.png`)!.async('string')).toBe('PNG');
    expect(zip.file(new RegExp(HIDDEN))).toHaveLength(0);
    const savedA = JSON.parse(await zip.file(`pages/${A}.json`)!.async('string'));
    expect(savedA.content[0].content[0].text).toBe('Hallo');
    const savedC = JSON.parse(await zip.file(`pages/${C}.json`)!.async('string'));
    expect(savedC.type).toBe('doc');
  });
});
