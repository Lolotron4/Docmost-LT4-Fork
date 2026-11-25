// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Injectable, Logger } from '@nestjs/common';
import {
  IntegrationDefinition,
  IntegrationProvider,
  LinkDescription,
  OAuthConfig,
  ProviderAccount,
  PublicUnfurlOpts,
  ResolveAccountOpts,
  UnfurlOpts,
  UnfurlPattern,
  UnfurlResult,
} from '../../../core/integration/registry/integration-provider.interface';
import { normalizeBaseUrl } from '../../../core/integration/utils/integration.utils';
import { GitLabService } from './gitlab.service';
import { buildGitLabPatterns, decodeWorkItemShowParam } from './gitlab-patterns';

const DEFAULT_BASE_URL = 'https://gitlab.com';
// Lesender Zugriff genügt für Vorschauen; enthält auch /user.
const SCOPES = ['read_api'];

/**
 * Linkvorschauen für GitLab (gitlab.com oder eigene Instanz über
 * INTEGRATION_GITLAB_URL). Öffentliche Projekte gehen ohne Anmeldung,
 * private über die persönliche OAuth-Verbindung des Mitglieds
 * (INTEGRATION_GITLAB_CLIENT_ID / INTEGRATION_GITLAB_CLIENT_SECRET).
 */
@Injectable()
export class GitLabProvider extends IntegrationProvider {
  private readonly logger = new Logger(GitLabProvider.name);

  definition: IntegrationDefinition = {
    type: 'gitlab',
    name: 'GitLab',
    description: 'Link previews for projects, merge requests, issues and commits',
    icon: 'gitlab',
    capabilities: ['oauth', 'unfurl'],
    oauth: {
      authUrl: `${DEFAULT_BASE_URL}/oauth/authorize`,
      tokenUrl: `${DEFAULT_BASE_URL}/oauth/token`,
      scopes: SCOPES,
    },
  };

  constructor(private readonly gitlab: GitLabService) {
    super();
    const configured = process.env.INTEGRATION_GITLAB_URL;
    if (configured && !normalizeBaseUrl(configured)) {
      this.logger.warn(
        `INTEGRATION_GITLAB_URL is not a valid http(s) URL; falling back to ${DEFAULT_BASE_URL}`,
      );
    }
    const baseUrl = this.resolveBaseUrl();
    this.definition.oauth = {
      authUrl: `${baseUrl}/oauth/authorize`,
      tokenUrl: `${baseUrl}/oauth/token`,
      scopes: SCOPES,
    };
  }

  getOAuthConfig(): OAuthConfig {
    return this.definition.oauth;
  }

  // Nur der eingestellte Host, damit ein Token nie bei einem anderen Server landet.
  getUnfurlPatterns(): UnfurlPattern[] {
    return buildGitLabPatterns(this.resolveBaseUrl());
  }

  getUnfurlHosts(): string[] {
    return [new URL(this.resolveBaseUrl()).hostname];
  }

  async resolveAccount(opts: ResolveAccountOpts): Promise<ProviderAccount> {
    return this.gitlab.getAccount({
      authorization: `Bearer ${opts.accessToken}`,
      baseUrl: this.resolveBaseUrl(),
    });
  }

  async unfurl(opts: UnfurlOpts): Promise<UnfurlResult> {
    return this.unfurlWith(`Bearer ${opts.accessToken}`, opts);
  }

  // Anonym: GitLab liefert öffentliche Projekte ohne Token, private mit 404.
  async unfurlPublic(opts: PublicUnfurlOpts): Promise<UnfurlResult> {
    return this.unfurlWith(null, opts);
  }

  private async unfurlWith(
    authorization: string | null,
    opts: PublicUnfurlOpts,
  ): Promise<UnfurlResult> {
    const { match, patternType, url } = opts;
    const ctx = { authorization, baseUrl: this.resolveBaseUrl() };
    const project = match[1];

    switch (patternType) {
      case 'gitlab-mr':
        return this.gitlab.unfurlMergeRequest(ctx, project, parseInt(match[2], 10), url);
      case 'gitlab-issue':
        return this.gitlab.unfurlIssue(ctx, project, parseInt(match[2], 10), url);
      case 'gitlab-work-item-drawer': {
        const target = decodeWorkItemShowParam(url);
        if (!target) throw new Error('Invalid GitLab work item link');
        return this.gitlab.unfurlIssue(ctx, target.fullPath, target.iid, url);
      }
      case 'gitlab-commit':
        return this.gitlab.unfurlCommit(ctx, project, match[2], url);
      case 'gitlab-commit-in-mr':
        return this.gitlab.unfurlCommit(ctx, project, match[3], url);
      case 'gitlab-issues-list':
        return this.gitlab.unfurlProject(ctx, project, url, 'issues-list');
      case 'gitlab-merges-list':
        return this.gitlab.unfurlProject(ctx, project, url, 'merges-list');
      case 'gitlab-project':
        return this.gitlab.unfurlProject(ctx, project, url);
      default:
        throw new Error(`Unknown GitLab pattern type: ${patternType}`);
    }
  }

  describeLink(
    patternType: string,
    match: RegExpMatchArray,
    url: string,
  ): LinkDescription | null {
    const project = match[1];
    switch (patternType) {
      case 'gitlab-mr':
        return { title: `Merge Request !${match[2]}`, description: project };
      case 'gitlab-issue':
        return { title: `Issue #${match[2]}`, description: project };
      case 'gitlab-work-item-drawer': {
        const target = decodeWorkItemShowParam(url);
        return target
          ? { title: `Issue #${target.iid}`, description: target.fullPath }
          : { title: 'Work item', description: project };
      }
      case 'gitlab-commit':
        return { title: `Commit ${match[2].slice(0, 8)}`, description: project };
      case 'gitlab-commit-in-mr':
        return { title: `Commit ${match[3].slice(0, 8)}`, description: project };
      case 'gitlab-issues-list':
        return { title: 'Issues', description: project };
      case 'gitlab-merges-list':
        return { title: 'Merge Requests', description: project };
      case 'gitlab-project':
        return { title: project };
      default:
        return null;
    }
  }

  private resolveBaseUrl(): string {
    const baseUrl = process.env.INTEGRATION_GITLAB_URL;
    return (baseUrl && normalizeBaseUrl(baseUrl)) || DEFAULT_BASE_URL;
  }
}
