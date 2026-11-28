import { planBaseImport } from './lt4docs-base';

describe('lt4docs-base (Import von Datenbanken)', () => {
  it('übernimmt Eigenschaften, Ansichten und Zeilen bereinigt', () => {
    const plan = planBaseImport({
      properties: [
        { id: 'pstatus', name: 'Status', type: 'select', position: 'a1', typeOptions: { options: [{ id: 'o1', name: 'Fertig', color: 'green' }] } },
        { id: 'pname', name: 'Name', type: 'text', position: 'a0', isPrimary: true },
        { id: 'pdate', name: 'name', type: 'date', position: 'a2', typeOptions: { includeTime: true } },
        { id: 'böse id', name: 'X', type: 'text' },
        { id: 'pfalsch', name: 'Y', type: 'gibtsnicht' },
      ],
      views: [
        { id: 'v1', name: 'Board', type: 'kanban', position: 'a0', config: { groupByPropertyId: 'pstatus' } },
        { id: 'v2', name: 'Kalender', type: 'calendar', position: 'a1', config: { datePropertyId: 'fehlt' } },
        { id: 'v3', name: 'Gantt', type: 'gantt' },
      ],
      rows: [
        { id: 'r2', position: 'a1', cells: { pname: 'Zweite', pstatus: 'o9' } },
        { id: 'r1', position: 'a0', cells: { pname: 'Erste', pstatus: 'o1', pdate: { start: '2026-11-28T10:00' }, fremd: 'x' } },
      ],
    });
    expect(plan.properties.map((p) => [p.id, p.name, p.isPrimary])).toEqual([
      ['pname', 'Name', true],
      ['pstatus', 'Status', false],
      ['pdate', 'name 2', false],
    ]);
    expect(plan.properties[0].position < plan.properties[1].position).toBe(true);
    expect(plan.views.map((v) => v.type)).toEqual(['kanban', 'calendar']);
    expect(plan.views[0].config).toEqual({ groupByPropertyId: 'pstatus' });
    expect(plan.views[1].config).toEqual({});
    expect(plan.rows.map((r) => r.cells)).toEqual([
      { pname: 'Erste', pstatus: 'o1', pdate: { start: '2026-11-28T10:00' } },
      { pname: 'Zweite' },
    ]);
  });

  it('legt bei fehlenden Daten eine Name-Spalte und eine Tabelle an', () => {
    const plan = planBaseImport(null);
    expect(plan.properties).toHaveLength(1);
    expect(plan.properties[0]).toMatchObject({ name: 'Name', type: 'text', isPrimary: true });
    expect(plan.views).toEqual([expect.objectContaining({ type: 'table', name: 'Tabelle' })]);
    expect(plan.rows).toEqual([]);
  });
});
