// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// KI-Schreibassistent: Einstellungen (Admin) und Textgenerierung mit Claude, ChatGPT und Gemini.
import { hasPermission } from '../roles/role-store';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import Anthropic from '@anthropic-ai/sdk';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { AiGenerateDto, UpdateAiSettingsDto } from './ai.dto';
import {
  AI_PROVIDERS,
  AiProvider,
  buildUserMessage,
  CLAUDE_FALLBACK_MODELS,
  decryptApiKey,
  DEFAULT_MODELS,
  encryptApiKey,
  isProvider,
  maskKey,
  SYSTEM_PROMPT,
} from './ai.util';

type StoredSettings = {
  provider: AiProvider;
  access: 'all' | 'restricted';
  allowedGroupIds: string[];
  allowedUserIds: string[];
  models: Partial<Record<AiProvider, string>>;
  apiKeys: Partial<Record<AiProvider, string>>;
};

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

/** Effort-Stufe wird nur an Claude-Modelle geschickt, die sie kennen. */
function supportsEffort(model: string) {
  return /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|haiku-5|fable|mythos)/.test(model);
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly usage = new Map<string, number[]>();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  private isEnabled(workspace: Workspace) {
    return (workspace.settings as any)?.ai?.generative === true;
  }

  private async load(workspaceId: string): Promise<StoredSettings> {
    const row = await this.db
      .selectFrom('lt4AiSettings')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return {
      provider: isProvider(row?.provider) ? row.provider : 'anthropic',
      access: row?.access === 'restricted' ? 'restricted' : 'all',
      allowedGroupIds: Array.isArray(row?.allowedGroupIds) ? (row.allowedGroupIds as string[]) : [],
      allowedUserIds: Array.isArray(row?.allowedUserIds) ? (row.allowedUserIds as string[]) : [],
      models: ((row?.models as any) ?? {}) as StoredSettings['models'],
      apiKeys: ((row?.apiKeys as any) ?? {}) as StoredSettings['apiKeys'],
    };
  }

  private modelFor(settings: StoredSettings, provider: AiProvider) {
    return settings.models[provider]?.trim() || DEFAULT_MODELS[provider];
  }

  private keyFor(settings: StoredSettings, provider: AiProvider) {
    const stored = settings.apiKeys[provider];
    if (!stored) return null;
    try {
      return decryptApiKey(stored, this.environmentService.getAppSecret());
    } catch {
      return null;
    }
  }

  /** Darf diese Person den Assistenten nutzen? Admins und Owner immer. */
  private async canUse(user: User, workspace: Workspace, settings: StoredSettings) {
    if (settings.access === 'all') return true;
    if (hasPermission(user, 'settings')) return true;
    if (settings.allowedUserIds.includes(user.id)) return true;
    if (!settings.allowedGroupIds.length) return false;
    const membership = await this.db
      .selectFrom('groupUsers')
      .innerJoin('groups', 'groups.id', 'groupUsers.groupId')
      .select('groupUsers.groupId')
      .where('groupUsers.userId', '=', user.id)
      .where('groups.workspaceId', '=', workspace.id)
      .where('groupUsers.groupId', 'in', settings.allowedGroupIds)
      .executeTakeFirst();
    return !!membership;
  }

  private async resolveAccessLists(workspaceId: string, settings: StoredSettings) {
    const groups = settings.allowedGroupIds.length
      ? await this.db
          .selectFrom('groups')
          .select(['id', 'name'])
          .where('workspaceId', '=', workspaceId)
          .where('id', 'in', settings.allowedGroupIds)
          .orderBy('name')
          .execute()
      : [];
    const users = settings.allowedUserIds.length
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name', 'email', 'avatarUrl'])
          .where('workspaceId', '=', workspaceId)
          .where('deletedAt', 'is', null)
          .where('id', 'in', settings.allowedUserIds)
          .orderBy('name')
          .execute()
      : [];
    return { groups, users };
  }

  private async present(workspace: Workspace, settings: StoredSettings) {
    const keys = {} as Record<AiProvider, string | null>;
    const models = {} as Record<AiProvider, string>;
    for (const p of AI_PROVIDERS) {
      const key = this.keyFor(settings, p);
      keys[p] = key ? maskKey(key) : null;
      models[p] = this.modelFor(settings, p);
    }
    const lists = await this.resolveAccessLists(workspace.id, settings);
    return {
      enabled: this.isEnabled(workspace),
      provider: settings.provider,
      access: settings.access,
      allowedGroups: lists.groups,
      allowedUsers: lists.users,
      models,
      defaultModels: DEFAULT_MODELS,
      keys,
    };
  }

  async getSettings(user: User, workspace: Workspace) {
    this.assertAdmin(user, workspace);
    return this.present(workspace, await this.load(workspace.id));
  }

  /** Für alle Mitglieder: Ist der Assistent nutzbar? Keine Schlüssel. */
  async status(user: User, workspace: Workspace) {
    const settings = await this.load(workspace.id);
    const enabled = this.isEnabled(workspace);
    const allowed = enabled && (await this.canUse(user, workspace, settings));
    return {
      enabled,
      allowed,
      ready: allowed && !!this.keyFor(settings, settings.provider),
      provider: settings.provider,
    };
  }

  async updateSettings(user: User, workspace: Workspace, dto: UpdateAiSettingsDto) {
    this.assertAdmin(user, workspace);
    const current = await this.load(workspace.id);
    const appSecret = this.environmentService.getAppSecret();

    const models = { ...current.models };
    const apiKeys = { ...current.apiKeys };
    for (const p of AI_PROVIDERS) {
      const model = dto.models?.[p];
      if (typeof model === 'string') {
        const trimmed = model.trim();
        if (trimmed.length > 100 || !/^[\w.:\-/@]*$/.test(trimmed)) {
          throw new BadRequestException('Invalid model name');
        }
        if (trimmed) models[p] = trimmed;
        else delete models[p];
      }
      const key = dto.apiKeys?.[p];
      if (typeof key === 'string') {
        const trimmed = key.trim();
        if (trimmed.length > 500) throw new BadRequestException('Invalid API key');
        if (trimmed) apiKeys[p] = encryptApiKey(trimmed, appSecret);
        else delete apiKeys[p];
      }
    }
    const provider = dto.provider ?? current.provider;
    const access = dto.access ?? current.access;
    // Nur IDs aus diesem Workspace übernehmen
    let allowedGroupIds = current.allowedGroupIds;
    if (dto.allowedGroupIds) {
      const ids = [...new Set(dto.allowedGroupIds)];
      allowedGroupIds = ids.length
        ? (
            await this.db
              .selectFrom('groups')
              .select('id')
              .where('workspaceId', '=', workspace.id)
              .where('id', 'in', ids)
              .execute()
          ).map((g) => g.id)
        : [];
    }
    let allowedUserIds = current.allowedUserIds;
    if (dto.allowedUserIds) {
      const ids = [...new Set(dto.allowedUserIds)];
      allowedUserIds = ids.length
        ? (
            await this.db
              .selectFrom('users')
              .select('id')
              .where('workspaceId', '=', workspace.id)
              .where('id', 'in', ids)
              .execute()
          ).map((u) => u.id)
        : [];
    }
    const accessValues = {
      access,
      // Als Text übergeben und in SQL nach jsonb wandeln (sonst doppelt kodiert bzw. Postgres-Array)
      allowedGroupIds: sql`${JSON.stringify(allowedGroupIds)}::text::jsonb`,
      allowedUserIds: sql`${JSON.stringify(allowedUserIds)}::text::jsonb`,
    };

    await this.db
      .insertInto('lt4AiSettings')
      .values({ workspaceId: workspace.id, provider, models, apiKeys, ...accessValues } as any)
      .onConflict((oc) =>
        oc.column('workspaceId').doUpdateSet({
          provider,
          models: models as any,
          apiKeys: apiKeys as any,
          ...(accessValues as any),
          updatedAt: new Date(),
        }),
      )
      .execute();

    let ws = workspace;
    if (typeof dto.enabled === 'boolean') {
      const updated = await this.workspaceRepo.updateAiSettings(
        workspace.id,
        'generative',
        dto.enabled,
      );
      if (updated) ws = updated as Workspace;
    }
    return this.present(ws, await this.load(workspace.id));
  }

  /** Listet verfügbare Modelle beim Anbieter – dient gleichzeitig als Schlüsseltest. */
  async listModels(user: User, workspace: Workspace, provider: AiProvider) {
    this.assertAdmin(user, workspace);
    const settings = await this.load(workspace.id);
    const key = this.keyFor(settings, provider);
    if (!key) throw new BadRequestException('No API key saved for this provider');

    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey: key, authToken: null, maxRetries: 1, timeout: 15_000 });
        const ids: string[] = [];
        for await (const model of client.models.list({ limit: 100 })) {
          ids.push(model.id);
        }
        return { models: ids };
      }
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: any = await res.json();
        const ids = (body?.data ?? [])
          .map((m: any) => String(m.id))
          .filter((id: string) => /^(gpt-|o\d|chatgpt-)/.test(id))
          .filter((id: string) => !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id))
          .sort()
          .reverse();
        return { models: ids };
      }
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
        {
          headers: { 'x-goog-api-key': key },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: any = await res.json();
      const ids = (body?.models ?? [])
        .filter((m: any) =>
          (m.supportedGenerationMethods ?? []).includes('generateContent'),
        )
        .map((m: any) => String(m.name).replace(/^models\//, ''))
        .filter((id: string) => id.startsWith('gemini'))
        .sort()
        .reverse();
      return { models: ids };
    } catch (err: any) {
      this.logger.warn(`AI model list failed (${provider}): ${err?.status ?? err?.message}`);
      throw new BadRequestException(
        'The provider rejected the request. Please check the API key.',
      );
    }
  }

  private checkRate(userId: string) {
    const now = Date.now();
    const recent = (this.usage.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) {
      throw new HttpException('Too many AI requests. Please wait a moment.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.usage.set(userId, recent);
  }

  /**
   * Prüft alles vorab (damit Fehler als normale HTTP-Antwort kommen)
   * und gibt dann einen Text-Stream zurück.
   */
  async prepareGenerate(user: User, workspace: Workspace, dto: AiGenerateDto) {
    if (!this.isEnabled(workspace)) {
      throw new ForbiddenException('The AI assistant is disabled in this workspace.');
    }
    const content = buildUserMessage(dto);
    if (!content) throw new BadRequestException('Text or instruction missing');

    const settings = await this.load(workspace.id);
    if (!(await this.canUse(user, workspace, settings))) {
      throw new ForbiddenException('You are not allowed to use the AI assistant.');
    }
    const provider = settings.provider;
    const key = this.keyFor(settings, provider);
    if (!key) {
      throw new BadRequestException('No API key configured for the AI assistant.');
    }
    this.checkRate(user.id);
    const model = this.modelFor(settings, provider);

    return (signal: AbortSignal) =>
      provider === 'anthropic'
        ? this.streamClaude(key, model, content, signal)
        : this.streamAiSdk(provider, key, model, content, signal);
  }

  private async *streamClaude(
    apiKey: string,
    model: string,
    content: string,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const client = new Anthropic({ apiKey, authToken: null, maxRetries: 1 });
    const useFallback = CLAUDE_FALLBACK_MODELS.has(model);
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        ...(supportsEffort(model) ? { output_config: { effort: 'low' } } : {}),
        ...(useFallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
          : {}),
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new Error('The AI declined this request.');
    }
  }

  private async *streamAiSdk(
    provider: Exclude<AiProvider, 'anthropic'>,
    apiKey: string,
    model: string,
    content: string,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const languageModel =
      provider === 'openai'
        ? createOpenAI({ apiKey })(model)
        : createGoogleGenerativeAI({ apiKey })(model);
    const result = streamText({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt: content,
      maxRetries: 1,
      abortSignal: signal,
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') yield part.text;
      else if (part.type === 'error') throw part.error;
    }
  }
}
