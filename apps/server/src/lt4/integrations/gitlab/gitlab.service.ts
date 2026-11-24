// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Liest Merge Requests, Issues, Commits und Projekte über die GitLab-REST-API v4.
import { Injectable } from '@nestjs/common';
import {
  ProviderAccount,
  UnfurlResult,
} from '../../../core/integration/registry/integration-provider.interface';
import { relativeTime } from '../../../core/integration/utils/relative-time';
import { providerApiFetch } from '../../../core/integration/utils/provider-fetch';
import { toProviderAccount } from '../../../core/integration/utils/integration.utils';

type Ctx = {
  // "Bearer <token>" oder null für anonyme Abfragen öffentlicher Projekte
  authorization: string | null;
  baseUrl: string;
};

const COLORS = {
  open: 'green',
  merged: 'violet',
  closed: 'red',
  draft: 'gray',
  issueClosed: 'violet',
};

@Injectable()
export class GitLabService {
  async getAccount(ctx: Ctx): Promise<ProviderAccount> {
    const data = await this.apiGet(ctx, '/user');
    return toProviderAccount({
      id: data.id,
      displayName: data.name,
      username: data.username,
    });
  }

  async unfurlMergeRequest(
    ctx: Ctx,
    projectPath: string,
    iid: number,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      ctx,
      `${projectApiPath(projectPath)}/merge_requests/${iid}`,
    );
    const author = data.author?.username;
    const draft = data.draft === true || data.work_in_progress === true;
    let status: string;
    let statusColor: string;
    if (data.state === 'merged') {
      status = 'merged';
      statusColor = COLORS.merged;
    } else if (data.state === 'closed' || data.state === 'locked') {
      status = 'closed';
      statusColor = COLORS.closed;
    } else if (draft) {
      status = 'draft';
      statusColor = COLORS.draft;
    } else {
      status = 'open';
      statusColor = COLORS.open;
    }

    return {
      title: str(data.title) ?? `!${iid}`,
      description: [
        `!${data.iid ?? iid}`,
        safeRelative(data.updated_at ?? data.created_at),
        author,
      ]
        .filter(Boolean)
        .join(' · '),
      url,
      provider: 'gitlab',
      providerIcon: 'gitlab',
      status,
      statusColor,
      author,
      authorAvatarUrl: this.avatar(ctx, data.author?.avatar_url),
      metadata: {
        type: 'mr',
        iid: data.iid ?? iid,
        repo: projectPath,
        labels: labelNames(data.labels),
        draft,
        sourceBranch: str(data.source_branch),
        targetBranch: str(data.target_branch),
      },
    };
  }

  async unfurlIssue(
    ctx: Ctx,
    projectPath: string,
    iid: number,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      ctx,
      `${projectApiPath(projectPath)}/issues/${iid}`,
    );
    const author = data.author?.username;
    const open = data.state !== 'closed';
    return {
      title: str(data.title) ?? `#${iid}`,
      description: [
        `#${data.iid ?? iid}`,
        safeRelative(data.updated_at ?? data.created_at),
        author,
      ]
        .filter(Boolean)
        .join(' · '),
      url,
      provider: 'gitlab',
      providerIcon: 'gitlab',
      status: open ? 'open' : 'closed',
      statusColor: open ? COLORS.open : COLORS.issueClosed,
      author,
      authorAvatarUrl: this.avatar(ctx, data.author?.avatar_url),
      metadata: {
        type: 'issue',
        iid: data.iid ?? iid,
        repo: projectPath,
        labels: labelNames(data.labels),
        assignees: Array.isArray(data.assignees)
          ? data.assignees.map((a: any) => str(a?.username)).filter(Boolean)
          : [],
      },
    };
  }

  async unfurlCommit(
    ctx: Ctx,
    projectPath: string,
    sha: string,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      ctx,
      `${projectApiPath(projectPath)}/repository/commits/${encodeURIComponent(sha)}`,
    );
    const shortSha = str(data.short_id) ?? sha.slice(0, 8);
    const author = str(data.author_name);
    return {
      title: str(data.title) ?? str(data.message)?.split('\n')[0] ?? shortSha,
      description: [shortSha, safeRelative(data.authored_date ?? data.created_at), author]
        .filter(Boolean)
        .join(' · '),
      url,
      provider: 'gitlab',
      providerIcon: 'gitlab',
      author,
      metadata: {
        type: 'commit',
        sha: str(data.id) ?? sha,
        shortSha,
        repo: projectPath,
        stats: data.stats,
      },
    };
  }

  async unfurlProject(
    ctx: Ctx,
    projectPath: string,
    url: string,
    collection?: 'issues-list' | 'merges-list',
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(ctx, projectApiPath(projectPath));
    const fullName =
      str(data.name_with_namespace) ?? str(data.path_with_namespace) ?? projectPath;
    const visibility = str(data.visibility);
    const avatar =
      this.avatar(ctx, data.avatar_url) ?? this.avatar(ctx, data.namespace?.avatar_url);

    if (collection) {
      const label = collection === 'issues-list' ? 'Issues' : 'Merge Requests';
      return {
        title: `${label} · ${fullName}`,
        description: projectPath,
        url,
        provider: 'gitlab',
        providerIcon: 'gitlab',
        authorAvatarUrl: avatar,
        metadata: { type: collection, repo: projectPath },
      };
    }

    return {
      title: fullName,
      description: str(data.description)?.slice(0, 200) || undefined,
      url,
      provider: 'gitlab',
      providerIcon: 'gitlab',
      status:
        visibility === 'public'
          ? 'Public'
          : visibility === 'internal'
            ? 'Internal'
            : visibility
              ? 'Private'
              : undefined,
      statusColor: visibility === 'public' ? 'green' : 'gray',
      author: str(data.namespace?.full_path) ?? str(data.namespace?.name),
      authorAvatarUrl: avatar,
      metadata: {
        type: 'repo',
        repo: projectPath,
        stars: data.star_count,
        forks: data.forks_count,
        defaultBranch: str(data.default_branch),
      },
    };
  }

  /** Avatare dürfen nur von http(s) kommen; relative Pfade gehören zur Instanz. */
  private avatar(ctx: Ctx, raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw) return undefined;
    try {
      const parsed = new URL(raw, ctx.baseUrl);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:'
        ? parsed.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async apiGet(ctx: Ctx, path: string): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'LT4-Docs',
    };
    if (ctx.authorization) headers.Authorization = ctx.authorization;
    const response = await providerApiFetch(
      'GitLab',
      `${ctx.baseUrl}/api/v4${path}`,
      { headers },
    );
    return response.json();
  }
}

export function projectApiPath(projectPath: string): string {
  return `/projects/${encodeURIComponent(projectPath)}`;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function labelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((l: any) => (typeof l === 'string' ? l : str(l?.name)))
    .filter(Boolean) as string[];
}

function safeRelative(iso: unknown): string | undefined {
  if (typeof iso !== 'string') return undefined;
  try {
    return relativeTime(iso);
  } catch {
    return undefined;
  }
}
