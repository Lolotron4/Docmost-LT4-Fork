import { convertCells, parseDate, sanitizeCell, sanitizeTypeOptions, sanitizeViewConfig } from './base.util';

const opts = { options: [{ id: 'o1', name: 'Offen', color: 'red' }, { id: 'o2', name: 'Fertig', color: 'green' }] };

describe('base.util', () => {
  it('prüft Zellwerte je Typ', () => {
    expect(sanitizeCell('number', null, '3,5')).toBe(3.5);
    expect(sanitizeCell('number', null, 'abc')).toBeUndefined();
    expect(sanitizeCell('checkbox', null, false)).toBeUndefined();
    expect(sanitizeCell('checkbox', null, true)).toBe(true);
    expect(sanitizeCell('select', opts, 'o1')).toBe('o1');
    expect(sanitizeCell('select', opts, 'fremd')).toBeUndefined();
    expect(sanitizeCell('multiSelect', opts, ['o1', 'x', 'o1', 'o2'])).toEqual(['o1', 'o2']);
    expect(sanitizeCell('date', null, '24.11.2026')).toEqual({ start: '2026-11-24' });
    expect(sanitizeCell('date', null, '2026-02-30')).toBeUndefined();
    expect(sanitizeCell('text', null, '')).toBeUndefined();
  });

  it('speichert Termine mit Uhrzeit und Ende', () => {
    const withTime = { includeTime: true };
    expect(sanitizeCell('date', withTime, { start: '2026-11-24T14:30', end: '2026-11-24T16:00' })).toEqual({ start: '2026-11-24T14:30', end: '2026-11-24T16:00' });
    expect(sanitizeCell('date', withTime, { start: '24.11.2026 9:05' })).toEqual({ start: '2026-11-24T09:05' });
    expect(sanitizeCell('date', withTime, { start: '2026-11-24T25:00' })).toBeUndefined();
    expect(sanitizeCell('date', withTime, { start: '2026-11-24T14:30', end: '2026-11-24T10:00' })).toEqual({ start: '2026-11-24T14:30' });
    // Ohne Uhrzeit-Option wird die Zeit abgeschnitten.
    expect(sanitizeCell('date', null, { start: '2026-11-24T14:30' })).toEqual({ start: '2026-11-24' });
  });

  it('speichert keine Formelwerte, nur den Ausdruck', () => {
    expect(sanitizeCell('formula', { expression: '1+1' }, 2)).toBeUndefined();
    expect(sanitizeTypeOptions('formula', { expression: '{A} * 2', evil: 1 })).toEqual({ expression: '{A} * 2' });
    expect(sanitizeTypeOptions('date', { includeTime: 'ja' })).toEqual({ includeTime: false });
  });

  it('liest Datumsformate', () => {
    expect(parseDate('2026-01-05T10:00:00Z')).toBe('2026-01-05');
    expect(parseDate({ start: '2026-01-05' })).toBe('2026-01-05');
    expect(parseDate('morgen')).toBeNull();
  });

  it('wandelt Text in Auswahl um und legt Optionen an', () => {
    const r = convertCells({ type: 'text', typeOptions: null }, { type: 'select', typeOptions: {} }, ['Offen', 'offen', 'Neu', undefined]);
    expect(r.typeOptions.options.map((o) => o.name)).toEqual(['Offen', 'Neu']);
    expect(r.values[0]).toBe(r.values[1]);
    expect(r.values[3]).toBeUndefined();
  });

  it('wandelt Auswahl in Text und Mehrfachauswahl um', () => {
    expect(convertCells({ type: 'select', typeOptions: opts }, { type: 'text', typeOptions: null }, ['o2']).values).toEqual(['Fertig']);
    const m = convertCells({ type: 'select', typeOptions: opts }, { type: 'multiSelect', typeOptions: {} }, ['o1']);
    expect(m.values).toEqual([['o1']]);
    expect(m.typeOptions.options).toHaveLength(2);
  });

  it('wandelt Zahl, Häkchen und Datum um', () => {
    expect(convertCells({ type: 'text', typeOptions: null }, { type: 'number', typeOptions: null }, ['4,2', 'x']).values).toEqual([4.2, undefined]);
    expect(convertCells({ type: 'text', typeOptions: null }, { type: 'checkbox', typeOptions: null }, ['ja', 'nein']).values).toEqual([true, undefined]);
    expect(convertCells({ type: 'text', typeOptions: null }, { type: 'date', typeOptions: null }, ['1.2.2027']).values).toEqual([{ start: '2027-02-01' }]);
  });

  it('bereinigt Ansichts-Einstellungen', () => {
    const c = sanitizeViewConfig({ sorts: [{ propertyId: 'p1', direction: 'x' }], propertyWidths: { p1: 5, p2: 200 }, evil: 1, groupByPropertyId: 'p3' });
    expect(c).toEqual({ sorts: [{ propertyId: 'p1', direction: 'asc' }], propertyWidths: { p2: 200 }, groupByPropertyId: 'p3' });
  });
});
