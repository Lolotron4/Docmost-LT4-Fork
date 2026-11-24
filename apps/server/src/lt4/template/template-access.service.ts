// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Wer darf Vorlagen sehen und verwalten?
//  - Workspace-Admins: alle Vorlagen.
//  - Bereichs-Vorlagen: Bereichs-Admins; Bereichs-Schreiber, wenn "Mitglieder dürfen Vorlagen erstellen" an ist.
//  - Workspace-Vorlagen: Mitglieder, wenn "Mitglieder dürfen Vorlagen erstellen" an ist.
//  - Benutzen/Ansehen: Workspace-Vorlagen alle, Bereichs-Vorlagen alle Mitglieder des Bereichs.
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { Template, User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceRole, UserRole } from '../../common/helpers/types/permission';

@Injectable()
export class TemplateAccessService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  isWorkspaceAdmin(user: User) {
    return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
  }

  membersMayCreate(workspace: Workspace) {
    return (workspace.settings as any)?.templates?.allowMemberTemplates === true;
  }

  async spaceRoles(user: User, spaceId: string): Promise<string[]> {
    const roles = await this.spaceMemberRepo.getUserSpaceRoles(user.id, spaceId);
    return (roles ?? []).map((r) => r.role);
  }

  /** Darf diese Person Vorlagen in diesem Bereich (null = Workspace) anlegen und ändern? */
  async canManageScope(user: User, workspace: Workspace, spaceId: string | null) {
    if (spaceId) {
      const space = await this.spaceRepo.findById(spaceId, workspace.id);
      if (!space) return false;
    }
    if (this.isWorkspaceAdmin(user)) return true;
    if (!spaceId) return this.membersMayCreate(workspace);
    const roles = await this.spaceRoles(user, spaceId);
    if (roles.includes(SpaceRole.ADMIN)) return true;
    return this.membersMayCreate(workspace) && roles.includes(SpaceRole.WRITER);
  }

  async canView(user: User, template: Template) {
    if (!template.spaceId) return true;
    return (await this.spaceRoles(user, template.spaceId)).length > 0;
  }

  async findViewableTemplate(
    templateId: string,
    user: User,
    workspace: Workspace,
    includeContent = false,
  ): Promise<Template> {
    const template = await this.templateRepo.findById(templateId, workspace.id, {
      includeContent,
    });
    if (!template || !(await this.canView(user, template))) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  /** Wird auch vom Kern beim Hochladen von Vorlagen-Anhängen benutzt. */
  async findEditableTemplate(
    templateId: string,
    user: User,
    workspace: Workspace,
    includeContent = false,
  ): Promise<Template> {
    const template = await this.findViewableTemplate(templateId, user, workspace, includeContent);
    if (!(await this.canManageScope(user, workspace, template.spaceId))) {
      throw new ForbiddenException();
    }
    return template;
  }
}
