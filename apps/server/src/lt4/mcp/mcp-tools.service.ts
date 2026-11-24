// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Werkzeuge der MCP-Schnittstelle. Jedes Werkzeug ruft dieselbe Kernlogik wie
// die REST-API auf, damit Bereichs- und Seitenrechte genau gleich gelten.
import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageController } from '../../core/page/page.controller';
import { SearchController } from '../../core/search/search.controller';
import { SpaceMemberService } from '../../core/space/services/space-member.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { LT4_MCP_VERSION } from './mcp.constants';

export type McpCaller = {
  user: User;
  workspace: Workspace;
  // false bei einem Nur-Lese-API-Schlüssel
  canWrite: boolean;
};

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

const MAX_MARKDOWN = 200_000;

@Injectable()
export class McpToolsService implements OnModuleInit {
  private pages: PageController;
  private search: SearchController;
  private spaceMembers: SpaceMemberService;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly environment: EnvironmentService,
  ) {}

  onModuleInit() {
    this.pages = this.moduleRef.get(PageController, { strict: false });
    this.search = this.moduleRef.get(SearchController, { strict: false });
    this.spaceMembers = this.moduleRef.get(SpaceMemberService, {
      strict: false,
    });
  }

  /** Baut für genau eine Anfrage einen MCP-Server mit den Rechten des Aufrufers. */
  createServer(caller: McpCaller): McpServer {
    const server = new McpServer(
      { name: 'lt4-docs', version: LT4_MCP_VERSION },
      {
        instructions:
          'LT4-Docs is a wiki/knowledge base (Docmost fork). Pages live in spaces. ' +
          'Use search_pages or list_pages to find pages, get_page to read them as Markdown. ' +
          (caller.canWrite
            ? 'create_page and update_page write Markdown content.'
            : 'This connection is read-only.'),
      },
    );
    const { user, workspace } = caller;

    server.registerTool(
      'list_spaces',
      {
        title: 'List spaces',
        description: 'Lists the spaces the user is a member of.',
        annotations: { readOnlyHint: true },
      },
      async () =>
        this.run(async () => {
          const spaces = await this.userSpaces(user);
          if (!spaces.length) return 'No spaces.';
          return spaces
            .map((s) => `- ${s.name} (spaceId: ${s.id}, slug: ${s.slug})${s.description ? ` – ${s.description}` : ''}`)
            .join('\n');
        }),
    );

    server.registerTool(
      'search_pages',
      {
        title: 'Search pages',
        description:
          'Full-text search over pages the user can read. Returns page ids, titles and matching snippets.',
        inputSchema: z.object({
          query: z.string().min(1).max(200).describe('Search words'),
          spaceId: z.string().uuid().optional().describe('Only search this space'),
          titleOnly: z.boolean().optional().describe('Only match page titles'),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ query, spaceId, titleOnly }) =>
        this.run(async () => {
          const result: any = await this.search.pageSearch(
            { query, spaceId, titleOnly } as any,
            user,
            workspace,
          );
          const items: any[] = (result?.items ?? []).slice(0, 20);
          if (!items.length) return `No pages found for "${query}".`;
          const slugs = await this.spaceSlugs(user);
          return items
            .map((p) => {
              const snippet = stripHtml(p.highlight ?? '').slice(0, 300);
              const url = this.pageUrl(slugs.get(p.spaceId ?? p.space?.id), p.slugId);
              return `- ${p.title || 'Untitled'} (pageId: ${p.id}${url ? `, ${url}` : ''})${snippet ? `\n  ${snippet}` : ''}`;
            })
            .join('\n');
        }),
    );

    server.registerTool(
      'list_pages',
      {
        title: 'List pages',
        description:
          'Lists the top-level pages of a space, or the child pages of a page (page tree).',
        inputSchema: z.object({
          spaceId: z.string().uuid().optional().describe('Space to list (top level)'),
          parentPageId: z.string().min(1).max(64).optional().describe('List the children of this page instead'),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ spaceId, parentPageId }) =>
        this.run(async () => {
          if (!spaceId && !parentPageId) {
            throw new UserError('Pass spaceId or parentPageId.');
          }
          const result: any = await this.pages.getSidebarPages(
            { spaceId, pageId: parentPageId } as any,
            { limit: 100 } as any,
            user,
          );
          const items: any[] = result?.items ?? [];
          if (!items.length) return 'No pages.';
          return items
            .map(
              (p) =>
                `- ${p.title || 'Untitled'} (pageId: ${p.id})${p.hasChildren ? ' [has child pages]' : ''}`,
            )
            .join('\n');
        }),
    );

    server.registerTool(
      'get_page',
      {
        title: 'Read page',
        description: 'Returns a page with its content as Markdown.',
        inputSchema: z.object({
          pageId: z.string().min(1).max(64).describe('Page id or slug id'),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ pageId }) =>
        this.run(async () => {
          const page: any = await this.pages.getPage(
            { pageId, format: 'markdown' } as any,
            user,
          );
          if (page.deletedAt) throw new NotFoundException('Page not found');
          const url = this.pageUrl(page.space?.slug, page.slugId);
          const header = [
            `# ${page.title || 'Untitled'}`,
            '',
            `pageId: ${page.id}`,
            `space: ${page.space?.name ?? ''} (spaceId: ${page.spaceId})`,
            page.parentPageId ? `parentPageId: ${page.parentPageId}` : null,
            url ? `url: ${url}` : null,
            `updatedAt: ${new Date(page.updatedAt).toISOString()}`,
            `canEdit: ${caller.canWrite && page.permissions?.canEdit === true}`,
            '',
            '---',
            '',
          ]
            .filter((l) => l !== null)
            .join('\n');
          const content =
            typeof page.content === 'string' ? page.content : '';
          return header + content;
        }),
    );

    if (caller.canWrite) {
      server.registerTool(
        'create_page',
        {
          title: 'Create page',
          description:
            'Creates a page in a space, optionally below a parent page. Content is Markdown.',
          inputSchema: z.object({
            spaceId: z.string().uuid(),
            title: z.string().min(1).max(500),
            markdown: z.string().max(MAX_MARKDOWN).optional(),
            parentPageId: z.string().uuid().optional(),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        async ({ spaceId, title, markdown, parentPageId }) =>
          this.run(async () => {
            const page: any = await this.pages.create(
              {
                spaceId,
                title,
                parentPageId,
                ...(markdown !== undefined
                  ? { content: markdown, format: 'markdown' }
                  : {}),
              } as any,
              user,
              workspace,
            );
            const slugs = await this.spaceSlugs(user);
            const url = this.pageUrl(slugs.get(page.spaceId), page.slugId);
            return `Created page "${page.title}" (pageId: ${page.id}${url ? `, ${url}` : ''}).`;
          }),
      );

      server.registerTool(
        'update_page',
        {
          title: 'Update page',
          description:
            'Changes the title and/or content of a page. mode "append" or "prepend" adds Markdown, "replace" overwrites the whole content.',
          inputSchema: z.object({
            pageId: z.string().min(1).max(64),
            title: z.string().min(1).max(500).optional(),
            markdown: z.string().max(MAX_MARKDOWN).optional(),
            mode: z.enum(['append', 'prepend', 'replace']).default('append'),
          }),
          annotations: { readOnlyHint: false, destructiveHint: true },
        },
        async ({ pageId, title, markdown, mode }) =>
          this.run(async () => {
            if (title === undefined && markdown === undefined) {
              throw new UserError('Pass title and/or markdown.');
            }
            const existing: any = await this.pages.getPage({ pageId } as any, user);
            const page: any = await this.pages.update(
              {
                pageId: existing.id,
                ...(title !== undefined ? { title } : {}),
                ...(markdown !== undefined
                  ? { content: markdown, format: 'markdown', operation: mode }
                  : {}),
              } as any,
              user,
            );
            return `Updated page "${page.title ?? existing.title}" (pageId: ${existing.id}).`;
          }),
      );
    }

    return server;
  }

  /** Fehler als Werkzeug-Ergebnis zurückgeben, damit das Modell sie lesen kann. */
  private async run(fn: () => Promise<string>): Promise<ToolResult> {
    try {
      return { content: [{ type: 'text', text: await fn() }] };
    } catch (err: any) {
      let message = 'Internal error';
      if (err instanceof UserError) message = err.message;
      else if (err instanceof ForbiddenException) message = 'Permission denied.';
      else if (err instanceof NotFoundException) message = 'Not found.';
      else if (err instanceof HttpException) {
        const res: any = err.getResponse();
        const msg = typeof res === 'string' ? res : res?.message;
        message = Array.isArray(msg) ? msg.join(', ') : String(msg ?? err.message);
      }
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }

  private async userSpaces(user: User) {
    const result = await this.spaceMembers.getUserSpaces(user.id, {
      limit: 100,
    } as any);
    return result.items ?? [];
  }

  private async spaceSlugs(user: User): Promise<Map<string, string>> {
    const spaces = await this.userSpaces(user);
    return new Map(spaces.map((s) => [s.id, s.slug]));
  }

  private pageUrl(spaceSlug: string | undefined, slugId: string | undefined) {
    if (!spaceSlug || !slugId) return undefined;
    return `${this.environment.getAppUrl()}/s/${spaceSlug}/p/${slugId}`;
  }
}

class UserError extends Error {}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
