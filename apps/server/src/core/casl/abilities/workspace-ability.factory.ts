import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { Lt4Permission, permissionsOf } from '../../../lt4/roles/role-store';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  IWorkspaceAbility,
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../interfaces/workspace-ability.type';

@Injectable()
export default class WorkspaceAbilityFactory {
  // LT4-Fork: Rechte kommen aus der Rolle (eingebaut oder selbst angelegt),
  // siehe lt4/roles/role-store.ts.
  createForUser(user: User, workspace: Workspace) {
    if (!user?.role) {
      throw new NotFoundException('Workspace permissions not found');
    }
    return buildWorkspaceAbility(
      permissionsOf({
        id: user.id,
        role: user.role,
        workspaceId: user.workspaceId ?? workspace?.id,
      }),
    );
  }
}

function buildWorkspaceAbility(permissions: Lt4Permission[]) {
  const { can, build } = new AbilityBuilder<MongoAbility<IWorkspaceAbility>>(
    createMongoAbility,
  );
  const has = (p: Lt4Permission) => permissions.includes(p);

  // Grundrechte jedes Mitglieds
  can(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Settings);
  can(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Member);
  can(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Space);
  can(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Group);
  can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Attachment);
  can(WorkspaceCaslAction.Create, WorkspaceCaslSubject.API);

  if (has('settings')) can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings);
  if (has('members')) can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Member);
  if (has('spaces')) can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space);
  if (has('groups')) can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Group);
  if (has('api')) can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API);
  if (has('audit')) can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit);

  return build();
}
