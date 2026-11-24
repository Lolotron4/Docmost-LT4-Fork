// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Vorlagen: verwalten, auf leere Seiten anwenden und neue Seiten daraus anlegen.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { v7 as uuid7 } from 'uuid';
import { getTemplateVariables } from '@docmost/editor-ext';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { Attachment, Template, User, Workspace } from '@docmost/db/types/entity.types';
import { PageService } from '../../core/page/services/page.service';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { StorageService } from '../../integrations/storage/storage.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { jsonToText } from '../../collaboration/collaboration.util';
import {
  createYdocFromJson,
  getAttachmentIds,
  replaceAttachmentIds,
} from '../../common/helpers/prosemirror/utils';
import { TemplateAccessService } from './template-access.service';
import {
  CreatePageFromTemplateDto,
  CreateTemplateDto,
  ListTemplatesDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './template.dto';
import { isEmptyDocument, normalizeValues, substituteVariables } from './template.util';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageRepo: PageRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly pageService: PageService,
    private readonly pageAccess: PageAccessService,
    private readonly attachmentService: AttachmentService,
    private readonly storageService: StorageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly access: TemplateAccessService,
  ) {}

  /** Prüft den Inhalt gegen das Vorlagen-Schema (inkl. Variablen und Platzhaltern). */
  private async validateContent(content: unknown) {
    try {
      const parsed = await this.pageService.parseProsemirrorContent(
        content as object,
        'json',
        'template',
      );
      getTemplateVariables(parsed); // wirft bei kaputten Variablen
      return parsed;
    } catch {
      throw new BadRequestException('Invalid template content');
    }
  }

  private async withPermissions(user: User, workspace: Workspace, templates: Template[]) {
    const cache = new Map<string, boolean>();
    const result = [];
    for (const t of templates) {
      const key = t.spaceId ?? 'workspace';
      if (!cache.has(key)) {
        cache.set(key, await this.access.canManageScope(user, workspace, t.spaceId ?? null));
      }
      result.push({ ...t, canEdit: cache.get(key) });
    }
    return result;
  }

  async permissions(user: User, workspace: Workspace) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    const manageableSpaceIds: string[] = [];
    for (const id of spaceIds) {
      if (await this.access.canManageScope(user, workspace, id)) manageableSpaceIds.push(id);
    }
    return {
      canManageWorkspace: await this.access.canManageScope(user, workspace, null),
      manageableSpaceIds,
      membersMayCreate: this.access.membersMayCreate(workspace),
    };
  }

  async list(user: User, workspace: Workspace, dto: ListTemplatesDto) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    const result = await this.templateRepo.findTemplates(
      workspace.id,
      spaceIds,
      { limit: dto.limit ?? 50, cursor: dto.cursor, query: dto.query } as any,
      { spaceId: dto.scope === 'workspace' ? null : dto.spaceId },
    );
    return {
      ...result,
      items: await this.withPermissions(user, workspace, result.items as Template[]),
    };
  }

  async info(user: User, workspace: Workspace, templateId: string) {
    const template = await this.access.findViewableTemplate(templateId, user, workspace, true);
    const [withPerm] = await this.withPermissions(user, workspace, [template]);
    return withPerm;
  }

  async create(user: User, workspace: Workspace, dto: CreateTemplateDto) {
    const spaceId = dto.spaceId || null;
    if (!(await this.access.canManageScope(user, workspace, spaceId))) {
      throw new ForbiddenException();
    }

    let content: any = EMPTY_DOC;
    let title = dto.title;
    let icon = dto.icon;
    let sourceAttachments: Attachment[] = [];
    if (dto.fromPageId) {
      const page = await this.pageRepo.findById(dto.fromPageId, { includeContent: true });
      if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
        throw new NotFoundException('Page not found');
      }
      await this.pageAccess.validateCanView(page, user);
      if (page.isBase) throw new BadRequestException('Databases cannot be saved as templates');
      content = page.content ?? EMPTY_DOC;
      title = title || page.title || undefined;
      icon = icon ?? page.icon ?? undefined;
      const ids = getAttachmentIds(content);
      if (ids.length) {
        const all = await this.attachmentRepo.findByIds(ids);
        sourceAttachments = all.filter((a) => a.pageId === page.id && a.workspaceId === workspace.id);
      }
    } else if (dto.content) {
      content = dto.content;
    }
    content = await this.validateContent(content);

    const templateId = uuid7();
    if (sourceAttachments.length) {
      const idMap = await this.copyAttachments(sourceAttachments, { templateId }, user.id);
      content = replaceAttachmentIds(content, idMap);
    }

    await this.templateRepo.insertTemplate({
      id: templateId,
      title: title || null,
      description: dto.description?.trim() || null,
      icon: icon || null,
      spaceId,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
      content,
      textContent: jsonToText(content),
    });
    return this.info(user, workspace, templateId);
  }

  async update(user: User, workspace: Workspace, dto: UpdateTemplateDto) {
    const template = await this.access.findEditableTemplate(dto.templateId, user, workspace);
    let spaceId = template.spaceId;
    if (dto.spaceId !== undefined && (dto.spaceId || null) !== template.spaceId) {
      spaceId = dto.spaceId || null;
      if (!(await this.access.canManageScope(user, workspace, spaceId))) {
        throw new ForbiddenException();
      }
    }
    const patch: Record<string, unknown> = { lastUpdatedById: user.id, spaceId };
    if (dto.title !== undefined) patch.title = dto.title || null;
    if (dto.description !== undefined) patch.description = dto.description.trim() || null;
    if (dto.icon !== undefined) patch.icon = dto.icon || null;
    if (dto.content !== undefined) {
      const content = await this.validateContent(dto.content);
      patch.content = content;
      patch.textContent = jsonToText(content);
    }
    await this.templateRepo.updateTemplate(patch as any, template.id, workspace.id);
    if (spaceId !== template.spaceId) {
      // Anhänge der Vorlage wandern mit in den neuen Bereich
      await this.db
        .updateTable('attachments')
        .set({ spaceId })
        .where('templateId', '=', template.id)
        .execute();
    }
    return this.info(user, workspace, template.id);
  }

  async remove(user: User, workspace: Workspace, templateId: string) {
    const template = await this.access.findEditableTemplate(templateId, user, workspace);
    await this.templateRepo.deleteTemplate(template.id, workspace.id);
    await this.attachmentService.handleDeleteTemplateAttachments(template.id);
  }

  /** Kopiert Dateien in eine Seite oder Vorlage und liefert die Zuordnung alt → neu. */
  private async copyAttachments(
    sources: Attachment[],
    target: { pageId?: string; spaceId?: string; templateId?: string },
    userId: string,
  ) {
    const idMap = new Map<string, string>();
    for (const source of sources) {
      const newId = uuid7();
      try {
        const newPath = source.filePath.replace(source.id, newId);
        await this.storageService.copy(source.filePath, newPath);
        await this.attachmentRepo.insertAttachment({
          id: newId,
          type: source.type,
          filePath: newPath,
          fileName: source.fileName,
          fileSize: source.fileSize,
          mimeType: source.mimeType,
          fileExt: source.fileExt,
          creatorId: userId,
          workspaceId: source.workspaceId,
          pageId: target.pageId ?? null,
          spaceId: target.spaceId ?? source.spaceId,
          templateId: target.templateId ?? null,
        } as any);
        idMap.set(source.id, newId);
      } catch (err) {
        this.logger.error(`Failed to copy attachment ${source.id}`, err as any);
      }
    }
    return idMap;
  }

  /** Inhalt mit eingesetzten Variablen und kopierten Anhängen für eine Seite vorbereiten. */
  private async prepareForPage(
    template: Template,
    variableValues: Record<string, string> | undefined,
    page: { id: string; spaceId: string },
    userId: string,
  ) {
    let content: any = substituteVariables(
      template.content ?? EMPTY_DOC,
      normalizeValues(variableValues),
    );
    const attachments = await this.attachmentRepo.findByTemplateId(template.id);
    if (attachments.length) {
      const idMap = new Map<string, string>();
      for (const a of attachments) idMap.set(a.id, uuid7());
      await this.attachmentService.copyAttachmentsToPage(attachments, idMap, page, userId);
      content = replaceAttachmentIds(content, idMap);
    }
    return content;
  }

  /** Für eine vorhandene, leere Seite: Inhalt fertig vorbereitet zurückgeben (der Editor setzt ihn ein). */
  async use(user: User, workspace: Workspace, dto: UseTemplateDto) {
    const template = await this.access.findViewableTemplate(dto.templateId, user, workspace, true);
    const page = await this.pageRepo.findById(dto.pageId, { includeContent: true });
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanEdit(page, user);
    if (page.isBase) throw new BadRequestException('Templates cannot be used on databases');
    if (!isEmptyDocument(page.content)) {
      throw new BadRequestException('This page is no longer empty');
    }
    const content = await this.prepareForPage(template, dto.variableValues, page, user.id);
    return {
      id: template.id,
      title: template.title,
      icon: template.icon,
      spaceId: template.spaceId,
      content,
    };
  }

  async createPage(user: User, workspace: Workspace, dto: CreatePageFromTemplateDto) {
    const template = await this.access.findViewableTemplate(dto.templateId, user, workspace, true);
    if (dto.parentPageId) {
      const parent = await this.pageRepo.findById(dto.parentPageId);
      if (!parent || parent.deletedAt || parent.spaceId !== dto.spaceId) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccess.validateCanEdit(parent, user);
    } else {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    // Seite zuerst leer anlegen, damit Anhänge ihr zugeordnet werden können
    const page = await this.pageService.create(user.id, workspace.id, {
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      title: template.title ?? undefined,
      icon: template.icon ?? undefined,
    });
    const content = await this.prepareForPage(template, dto.variableValues, page, user.id);
    await this.writeContent(page.id, content);
    return { id: page.id, slugId: page.slugId, spaceId: page.spaceId, title: page.title };
  }

  private async writeContent(pageId: string, content: any) {
    const parsed = await this.pageService.parseProsemirrorContent(content, 'json');
    await this.pageRepo.updatePage(
      {
        content: parsed,
        textContent: jsonToText(parsed),
        ydoc: createYdocFromJson(parsed),
      } as any,
      pageId,
    );
  }
}
