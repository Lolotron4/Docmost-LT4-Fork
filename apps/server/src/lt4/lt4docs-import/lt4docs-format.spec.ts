import * as path from 'path';
import {
  orderParentsFirst,
  parseManifest,
  resolveInside,
  rewriteAttachmentRefs,
  safeFileName,
} from './lt4docs-format';

const base = {
  format: 'lt4docs',
  version: 1,
  spaces: [{ id: 's1', name: 'Notizen' }],
};

describe('lt4docs-format', () => {
  it('lehnt fremde Dateien und zu neue Versionen ab', () => {
    expect(() => parseManifest('{}')).toThrow(/Keine LT4-Docs-Datei/);
    expect(() => parseManifest('kein json')).toThrow(/kein gültiges JSON/);
    expect(() =>
      parseManifest(JSON.stringify({ ...base, version: 2, pages: [] })),
    ).toThrow(/Version 2/);
  });

  it('entfernt fehlende Eltern und Zyklen', () => {
    const m = parseManifest(
      JSON.stringify({
        ...base,
        pages: [
          { id: 'a', spaceId: 's1', parentId: 'b', title: 'A', position: 0 },
          { id: 'b', spaceId: 's1', parentId: 'a', title: 'B', position: 1 },
          { id: 'c', spaceId: 's1', parentId: 'fehlt', title: 'C', position: 2 },
          { id: 'd', spaceId: 's1', parentId: 'c', title: 'D', position: 3 },
          { id: '../böse', spaceId: 's1', title: 'X' },
        ],
      }),
    );
    expect(m.pages.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    const byId = Object.fromEntries(m.pages.map((p) => [p.id, p.parentId]));
    expect(byId.c).toBeNull();
    expect(byId.d).toBe('c');
    // Zyklus a <-> b: mindestens einer wird zur obersten Seite
    expect(byId.a === null || byId.b === null).toBe(true);
  });

  it('sortiert Eltern vor Kindern', () => {
    const order = orderParentsFirst([
      { id: 'kind', parentId: 'eltern' },
      { id: 'enkel', parentId: 'kind' },
      { id: 'eltern', parentId: null },
    ]).map((p) => p.id);
    expect(order).toEqual(['eltern', 'kind', 'enkel']);
  });

  it('säubert Dateinamen und Pfade', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('a\\b\\bild.png')).toBe('bild.png');
    expect(safeFileName('..')).toBe('datei');
    const root = path.resolve('/tmp/x');
    expect(resolveInside(root, 'attachments', 'a1', 'bild.png')).toBe(
      path.join(root, 'attachments', 'a1', 'bild.png'),
    );
    expect(resolveInside(root, '..', 'y')).toBeNull();
  });

  it('ersetzt Anhang-Verweise', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'local-attachment/a1/bild.png', attachmentId: 'a1' },
        },
        {
          type: 'image',
          attrs: { src: 'local-attachment/zz/weg.png', attachmentId: 'zz' },
        },
      ],
    };
    const out = rewriteAttachmentRefs(
      doc,
      new Map([['a1', { id: 'neu', fileName: 'mein bild.png' }]]),
    );
    expect(out.content[0].attrs).toEqual({
      src: '/api/files/neu/mein%20bild.png',
      attachmentId: 'neu',
    });
    expect(out.content[1].attrs.src).toBe('');
    // Original bleibt unverändert
    expect(doc.content[0].attrs.attachmentId).toBe('a1');
  });
});

describe('lt4docs: Seite aus dem Client im Server-Schema', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseDocumentJson } = require('../../collaboration/collaboration.util');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixture = require('./__fixtures__/client-page.json');

  it('behält Formatierungen und entfernt unbekannte Knoten', () => {
    const oldId = JSON.stringify(fixture).match(/"attachmentId":\s*"([^"]+)"/)![1];
    const doc = rewriteAttachmentRefs(
      fixture,
      new Map([[oldId, { id: '019a0000-0000-7000-8000-000000000001', fileName: 'bild.png' }]]),
    );
    const json = parseDocumentJson(doc).node.toJSON();
    const types = new Set<string>();
    const marks = new Set<string>();
    const walk = (n: any) => {
      types.add(n.type);
      (n.marks ?? []).forEach((m: any) => marks.add(`${m.type}:${m.attrs?.color ?? ''}`));
      (n.content ?? []).forEach(walk);
    };
    walk(json);
    for (const t of ['callout', 'taskList', 'taskItem', 'table', 'tableHeader', 'image', 'details']) {
      expect(types).toContain(t);
    }
    expect(types).not.toContain('futureNode');
    expect(marks).toContain('textStyle:#e03131');
    expect(marks).toContain('highlight:#ffec99');
    expect(JSON.stringify(json)).toContain('/api/files/019a0000-0000-7000-8000-000000000001/bild.png');
  });
});
