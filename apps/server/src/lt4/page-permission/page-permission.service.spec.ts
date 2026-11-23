// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PagePermissionService } from './page-permission.service';
import { PagePermissionRole } from '../../common/helpers/types/permission';

const WORKSPACE = 'ws-1';
const page = {
  id: 'page-1',
  slugId: 'abc',
  title: 'Gruppe A',
  spaceId: 'space-1',
  workspaceId: WORKSPACE,
  parentPageId: null,
  deletedAt: null,
};
const user = { id: 'user-1' } as any;

function setup(opts: {
  spaceAdmin?: boolean;
  spaceEditor?: boolean;
  restriction?: { hasAnyRestriction: boolean; canAccess: boolean; canEdit: boolean };
  access?: { id: string } | undefined;
  writers?: number;
  targetRole?: string | undefined;
}) {
  const trx = {};
  const db: any = {
    transaction: () => ({ execute: (cb: any) => cb(trx) }),
  };
  const pageRepo: any = { findById: jest.fn().mockResolvedValue(page) };
  const repo: any = {
    findPageAccessByPageId: jest.fn().mockResolvedValue(opts.access),
    insertPageAccess: jest.fn().mockResolvedValue({ id: 'access-new' }),
    insertPagePermissions: jest.fn(),
    copyInheritedRestriction: jest.fn(),
    deletePageAccess: jest.fn(),
    findPagePermissionByUserId: jest
      .fn()
      .mockResolvedValue(
        opts.targetRole ? { role: opts.targetRole } : undefined,
      ),
    findPagePermissionByGroupId: jest
      .fn()
      .mockResolvedValue(
        opts.targetRole ? { role: opts.targetRole } : undefined,
      ),
    deletePagePermissionByUserId: jest.fn(),
    deletePagePermissionByGroupId: jest.fn(),
    updatePagePermissionRole: jest.fn(),
    countWritersByPageAccessId: jest.fn().mockResolvedValue(opts.writers ?? 1),
    canUserEditPage: jest.fn().mockResolvedValue(
      opts.restriction ?? {
        hasAnyRestriction: false,
        canAccess: true,
        canEdit: true,
      },
    ),
    canUserAccessPage: jest.fn().mockResolvedValue(true),
    findRestrictedAncestor: jest.fn().mockResolvedValue(undefined),
  };
  const ability = {
    can: (action: string, subject: string) => {
      if (subject === 'settings') return !!opts.spaceAdmin;
      if (action === 'edit') return !!opts.spaceEditor || !!opts.spaceAdmin;
      return true;
    },
    cannot(action: string, subject: string) {
      return !this.can(action, subject);
    },
  };
  const spaceAbility: any = {
    createForUser: jest.fn().mockResolvedValue(ability),
  };
  const cache: any = { del: jest.fn().mockResolvedValue(undefined) };
  const service = new PagePermissionService(
    db,
    pageRepo,
    repo,
    spaceAbility,
    cache,
  );
  return { service, repo, cache, pageRepo };
}

describe('PagePermissionService (LT4)', () => {
  it('restrict: legt Einschränkung an und macht den Nutzer zum Bearbeiter', async () => {
    const { service, repo, cache } = setup({ spaceEditor: true });
    repo.findPageAccessByPageId
      .mockResolvedValueOnce(undefined) // vor dem Kopieren
      .mockResolvedValueOnce(undefined) // nach dem Kopieren: nichts geerbt
      .mockResolvedValue({ id: 'access-new' });
    repo.findRestrictedAncestor.mockResolvedValue({ pageId: page.id, depth: 0 });

    await service.restrict(page.id, user, WORKSPACE);

    expect(repo.copyInheritedRestriction).toHaveBeenCalledWith(
      [page.id],
      expect.anything(),
    );
    expect(repo.insertPageAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: page.id,
        accessLevel: 'restricted',
        creatorId: user.id,
      }),
      expect.anything(),
    );
    expect(repo.insertPagePermissions).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          pageAccessId: 'access-new',
          userId: user.id,
          role: PagePermissionRole.WRITER,
        }),
      ],
      expect.anything(),
    );
    expect(cache.del).toHaveBeenCalledWith('ws:space-restrictions:space-1');
  });

  it('restrict: Leser ohne Bearbeitungsrecht dürfen nicht einschränken', async () => {
    const { service, repo } = setup({ spaceEditor: false });
    await expect(service.restrict(page.id, user, WORKSPACE)).rejects.toThrow(
      ForbiddenException,
    );
    expect(repo.insertPageAccess).not.toHaveBeenCalled();
  });

  it('Space-Admins dürfen verwalten, auch ohne Zugriff auf die Seite', async () => {
    const { service, repo } = setup({
      spaceAdmin: true,
      restriction: { hasAnyRestriction: true, canAccess: false, canEdit: false },
      access: { id: 'access-1' },
    });
    await service.unrestrict(page.id, user, WORKSPACE);
    expect(repo.deletePageAccess).toHaveBeenCalledWith(page.id);
  });

  it('eingeschränkte Seite: nur Bearbeiter der Seite dürfen verwalten', async () => {
    const { service } = setup({
      spaceEditor: true,
      restriction: { hasAnyRestriction: true, canAccess: true, canEdit: false },
      access: { id: 'access-1' },
    });
    await expect(service.unrestrict(page.id, user, WORKSPACE)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('remove: der letzte Bearbeiter kann nicht entfernt werden', async () => {
    const { service, repo } = setup({
      spaceEditor: true,
      access: { id: 'access-1' },
      writers: 1,
      targetRole: 'writer',
    });
    await expect(
      service.removeMember(
        { pageId: page.id, userId: 'user-2' },
        user,
        WORKSPACE,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repo.deletePagePermissionByUserId).not.toHaveBeenCalled();
  });

  it('updateRole: letzter Bearbeiter kann nicht zum Leser werden', async () => {
    const { service, repo } = setup({
      spaceEditor: true,
      access: { id: 'access-1' },
      writers: 1,
      targetRole: 'writer',
    });
    await expect(
      service.updateRole(
        { pageId: page.id, groupId: 'group-1', role: PagePermissionRole.READER },
        user,
        WORKSPACE,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repo.updatePagePermissionRole).not.toHaveBeenCalled();
  });

  it('remove: Leser darf entfernt werden', async () => {
    const { service, repo } = setup({
      spaceEditor: true,
      access: { id: 'access-1' },
      writers: 1,
      targetRole: 'reader',
    });
    await service.removeMember(
      { pageId: page.id, userId: 'user-2' },
      user,
      WORKSPACE,
    );
    expect(repo.deletePagePermissionByUserId).toHaveBeenCalledWith(
      'access-1',
      'user-2',
      expect.anything(),
    );
  });

  it('remove: genau ein Ziel (Nutzer oder Gruppe) ist Pflicht', async () => {
    const { service } = setup({ spaceEditor: true, access: { id: 'access-1' } });
    await expect(
      service.removeMember(
        { pageId: page.id, userId: 'u', groupId: 'g' },
        user,
        WORKSPACE,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('Seiten aus fremden Workspaces gelten als nicht gefunden', async () => {
    const { service, pageRepo } = setup({ spaceAdmin: true });
    pageRepo.findById.mockResolvedValue({ ...page, workspaceId: 'other' });
    await expect(service.getInfo(page.id, user, WORKSPACE)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('add: ohne Einschränkung gibt es nichts hinzuzufügen', async () => {
    const { service } = setup({ spaceEditor: true, access: undefined });
    await expect(
      service.addMembers(
        {
          pageId: page.id,
          userIds: ['3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'],
          role: PagePermissionRole.READER,
        },
        user,
        WORKSPACE,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
