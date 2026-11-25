// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { UnfurlPattern } from '../../../core/integration/registry/integration-provider.interface';
import { CANONICAL_PATH } from '../../../core/integration/utils/canonical-path';
import { escapeForRegex } from '../../../core/integration/utils/integration.utils';

// Ein Pfadsegment eines GitLab-Projekts. Ein einzelnes "-" ist kein Segment,
// sondern der Trenner vor /-/issues usw.; "." und ".." sind keine Namen.
const SEGMENT = String.raw`(?!(?:-|\.{1,2})(?:\/|$))[a-zA-Z0-9_.\-]+`;
// Gruppe(n) und Projekt, mindestens zwei Segmente: gruppe/projekt oder gruppe/untergruppe/projekt
const PROJECT_PATH = String.raw`(${SEGMENT}(?:\/${SEGMENT}){1,20})`;

/**
 * Link-Muster für eine GitLab-Instanz. Gruppe 1 ist immer der Projektpfad.
 * Nur Links auf genau diesen Host passen, damit ein Token nie an einen fremden
 * Server geht.
 */
export function buildGitLabPatterns(baseUrl: string): UnfurlPattern[] {
  const prefix = `^${escapeForRegex(baseUrl)}${CANONICAL_PATH}\\/${PROJECT_PATH}`;
  return [
    // Commit innerhalb eines Merge Requests: /-/merge_requests/12/diffs?commit_id=abc
    {
      regex: new RegExp(
        `${prefix}\\/-\\/merge_requests\\/(\\d{1,10})\\/diffs\\?(?:[^#]*&)?commit_id=([a-f0-9]{7,64})`,
      ),
      type: 'gitlab-commit-in-mr',
    },
    {
      regex: new RegExp(`${prefix}\\/-\\/merge_requests\\/(\\d{1,10})(?=[\\/?#]|$)`),
      type: 'gitlab-mr',
    },
    {
      regex: new RegExp(`${prefix}\\/-\\/(?:issues|work_items)\\/(\\d{1,10})(?=[\\/?#]|$)`),
      type: 'gitlab-issue',
    },
    // Work Item als Seitenleiste über der Liste (?show=<base64-JSON>)
    {
      regex: new RegExp(`${prefix}\\/-\\/(?:work_items|issues)\\/?\\?(?:[^#]*&)?show=([A-Za-z0-9_\\-+\\/=%]+)`),
      type: 'gitlab-work-item-drawer',
    },
    {
      regex: new RegExp(`${prefix}\\/-\\/commits?\\/([a-f0-9]{7,64})(?=[\\/?#]|$)`),
      type: 'gitlab-commit',
    },
    {
      regex: new RegExp(`${prefix}\\/-\\/issues\\/?(?:\\?[^#]*)?(?:#.*)?$`),
      type: 'gitlab-issues-list',
    },
    {
      regex: new RegExp(`${prefix}\\/-\\/merge_requests\\/?(?:\\?[^#]*)?(?:#.*)?$`),
      type: 'gitlab-merges-list',
    },
    {
      regex: new RegExp(`${prefix}\\/?(?:[?#].*)?$`),
      type: 'gitlab-project',
    },
  ];
}

/** Liest den ?show=-Parameter einer Work-Item-Seitenleiste (base64url-JSON). */
export function decodeWorkItemShowParam(
  url: string,
): { fullPath: string; iid: number } | null {
  try {
    const show = new URL(url).searchParams.get('show');
    if (!show) return null;
    const json = Buffer.from(
      show.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const payload = JSON.parse(json);
    const iid = parseInt(payload?.iid, 10);
    const fullPath = payload?.full_path;
    if (
      typeof fullPath !== 'string' ||
      !new RegExp(`^${PROJECT_PATH}$`).test(fullPath) ||
      !Number.isInteger(iid) ||
      iid <= 0
    ) {
      return null;
    }
    return { fullPath, iid };
  } catch {
    return null;
  }
}
