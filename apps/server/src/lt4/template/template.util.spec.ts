// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { isEmptyDocument, normalizeValues, substituteVariables } from './template.util';

const v = (name: string, marks?: any[]) => ({
  type: 'templateVariable',
  attrs: { id: '0193a5c1-0000-7000-8000-000000000001', name, fieldType: 'text', options: [] },
  ...(marks ? { marks } : {}),
});

describe('LT4 Vorlagen – Hilfsfunktionen', () => {
  it('setzt Variablen ohne Rücksicht auf Groß-/Kleinschreibung ein', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo ' }, v('Name'), { type: 'text', text: '!' }] }],
    };
    const out: any = substituteVariables(doc, normalizeValues({ name: 'Mario' }));
    expect(out.content[0].content.map((n: any) => n.text)).toEqual(['Hallo ', 'Mario', '!']);
    expect(doc.content[0].content[1].type).toBe('templateVariable'); // Original unverändert
  });

  it('übernimmt Formatierung und bricht mehrzeilige Werte um', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [v('Ziele', [{ type: 'bold' }])] }] };
    const out: any = substituteVariables(doc, normalizeValues({ Ziele: 'A\nB' }));
    expect(out.content[0].content).toEqual([
      { type: 'text', text: 'A', marks: [{ type: 'bold' }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
    ]);
  });

  it('entfernt Variablen ohne Wert', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [v('Leer')] }] };
    const out: any = substituteVariables(doc, normalizeValues({}));
    expect(out.content[0].content).toEqual([]);
  });

  it('erkennt leere Dokumente', () => {
    expect(isEmptyDocument(null)).toBe(true);
    expect(isEmptyDocument({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] })).toBe(false);
  });
});
