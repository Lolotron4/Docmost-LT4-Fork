import { extractTasks, taskMentionIds } from './task-extract';

const p = (id: string, ...content: any[]) => ({ type: 'paragraph', attrs: { id }, content });
const text = (t: string) => ({ type: 'text', text: t });
const mention = (id: string, userId: string, label: string, creatorId = 'u-creator') => ({
  type: 'mention',
  attrs: { id, entityType: 'user', entityId: userId, label, creatorId },
});
const date = (d: string) => ({ type: 'date', attrs: { date: d } });
const task = (checked: boolean, ...content: any[]) => ({ type: 'taskItem', attrs: { checked }, content });

describe('extractTasks', () => {
  it('liest Zuweisung, Fälligkeit und Status', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            task(false, p('a', text('Plakat malen '), mention('m1', 'u1', 'Max'), text(' bis '), date('2026-12-01'))),
            task(true, p('b', text('ohne Person '), date('2026-12-02'))),
            task(true, p('c', mention('m2', 'u2', 'Lea'), mention('m3', 'u1', 'Max')),
              { type: 'taskList', content: [task(false, p('d', text('Unteraufgabe '), mention('m4', 'u3', 'Tom')))] }),
          ],
        },
      ],
    };
    const tasks = extractTasks(doc);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toEqual({
      itemId: 'a',
      text: 'Plakat malen @Max bis 01.12.2026',
      checked: false,
      dueDate: '2026-12-01',
      assignees: [{ userId: 'u1', mentionId: 'm1', assignedById: 'u-creator' }],
    });
    expect(tasks[1].itemId).toBe('c');
    expect(tasks[1].checked).toBe(true);
    expect(tasks[1].assignees.map((a) => a.userId)).toEqual(['u2', 'u1']);
    // Unteraufgabe gehört nicht zum Eltern-Eintrag
    expect(tasks[1].text).toBe('');
    expect(tasks[2]).toMatchObject({ itemId: 'd', checked: false, dueDate: null });
    expect([...taskMentionIds(tasks)].sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('ignoriert leere und kaputte Dokumente', () => {
    expect(extractTasks(null)).toEqual([]);
    expect(extractTasks({ type: 'doc' })).toEqual([]);
  });
});
