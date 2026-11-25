// LT4-Fork: eigenständige Implementierung (AGPL-3.0).
import { buildGitLabPatterns, decodeWorkItemShowParam } from './gitlab-patterns';

const patterns = buildGitLabPatterns('https://gitlab.com');

function match(url: string) {
  for (const p of patterns) {
    const m = url.match(p.regex);
    if (m) return { type: p.type, groups: m.slice(1) };
  }
  return null;
}

describe('GitLab-Linkmuster', () => {
  it('erkennt Merge Requests, auch in Untergruppen', () => {
    expect(match('https://gitlab.com/gitlab-org/gitlab/-/merge_requests/123')).toEqual({
      type: 'gitlab-mr',
      groups: ['gitlab-org/gitlab', '123'],
    });
    expect(match('https://gitlab.com/a/b/c/-/merge_requests/7/diffs')?.groups.slice(0, 2)).toEqual(['a/b/c', '7']);
  });

  it('erkennt Commit im MR vor dem MR selbst', () => {
    expect(
      match('https://gitlab.com/g/p/-/merge_requests/5/diffs?commit_id=abcdef12')?.type,
    ).toBe('gitlab-commit-in-mr');
  });

  it('erkennt Issues, Work Items, Commits, Listen und Projekte', () => {
    expect(match('https://gitlab.com/g/p/-/issues/42')?.type).toBe('gitlab-issue');
    expect(match('https://gitlab.com/g/p/-/work_items/42')?.type).toBe('gitlab-issue');
    expect(match('https://gitlab.com/g/p/-/commit/0123abcd')?.type).toBe('gitlab-commit');
    expect(match('https://gitlab.com/g/p/-/issues')?.type).toBe('gitlab-issues-list');
    expect(match('https://gitlab.com/g/p/-/merge_requests?scope=all')?.type).toBe('gitlab-merges-list');
    expect(match('https://gitlab.com/g/p')).toEqual({ type: 'gitlab-project', groups: ['g/p'] });
  });

  it('lehnt fremde Hosts, Pfadtricks und Einzelsegmente ab', () => {
    expect(match('https://evil.example/g/p/-/issues/1')).toBeNull();
    expect(match('https://gitlab.com.evil.example/g/p/-/issues/1')).toBeNull();
    expect(match('https://gitlab.com/g/../p/-/issues/1')).toBeNull();
    expect(match('https://gitlab.com/g/%2e%2e/p/-/issues/1')).toBeNull();
    expect(match('https://gitlab.com/explore')).toBeNull();
  });

  it('nutzt die eingestellte eigene Instanz', () => {
    const own = buildGitLabPatterns('https://git.schule.de');
    expect(own.some((p) => p.regex.test('https://git.schule.de/klasse/projekt/-/issues/3'))).toBe(true);
    expect(own.some((p) => p.regex.test('https://gitlab.com/klasse/projekt/-/issues/3'))).toBe(false);
  });

  it('liest den show-Parameter von Work Items', () => {
    const show = Buffer.from(JSON.stringify({ iid: '9', full_path: 'g/p', id: 1 })).toString('base64');
    expect(
      decodeWorkItemShowParam(`https://gitlab.com/g/p/-/work_items?show=${encodeURIComponent(show)}`),
    ).toEqual({ fullPath: 'g/p', iid: 9 });
    const bad = Buffer.from(JSON.stringify({ iid: '9', full_path: '../x' })).toString('base64');
    expect(decodeWorkItemShowParam(`https://gitlab.com/g/p/-/work_items?show=${bad}`)).toBeNull();
  });
});
