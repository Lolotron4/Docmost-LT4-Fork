// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { hashPassword } from '../../common/helpers/utils';
import { ShareGuardService, normalizeShareLinkPolicy } from './share-guard.service';

function makeService(row: any, workspaceSettings: any = {}) {
  const db: any = {
    selectFrom: (table: string) => {
      const q: any = {
        select: () => q,
        where: () => q,
        executeTakeFirst: async () =>
          table === 'workspaces' ? { settings: workspaceSettings } : row,
      };
      return q;
    },
  };
  const env: any = { getAppSecret: () => 'secret', isHttps: () => false };
  return new ShareGuardService(db, env);
}

const user = (role = 'member') => ({ id: 'u1', role, workspaceId: 'ws1' }) as any;

describe('ShareGuardService', () => {
  it('lässt Freigaben ohne Einstellungen durch', async () => {
    await expect(makeService(undefined).assertAccess({ id: 's1' }, null)).resolves.toBeUndefined();
  });

  it('sperrt abgelaufene Links mit 410', async () => {
    const svc = makeService({ expiresAt: new Date(Date.now() - 1000), passwordHash: null });
    await expect(svc.assertAccess({ id: 's1' }, null)).rejects.toMatchObject({ status: 410 });
  });

  it('verlangt ein Passwort und akzeptiert danach das Cookie', async () => {
    const passwordHash = await hashPassword('geheim');
    const svc = makeService({ expiresAt: null, passwordHash });
    await expect(svc.assertAccess({ id: 's1' }, { cookies: {} } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await expect(svc.unlock('s1', 'falsch', { setCookie: jest.fn() } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const res = { setCookie: jest.fn() } as any;
    await svc.unlock('s1', 'geheim', res);
    const [name, value] = res.setCookie.mock.calls[0];
    expect(name).toBe('lt4share_s1');
    await expect(svc.assertAccess({ id: 's1' }, { cookies: { [name]: value } } as any)).resolves.toBeUndefined();

    // Cookie einer anderen Freigabe oder manipuliert: gesperrt
    await expect(
      svc.assertAccess({ id: 's2' }, { cookies: { lt4share_s2: value } } as any),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      svc.assertAccess({ id: 's1' }, { cookies: { [name]: value.slice(0, -2) + 'xx' } } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prüft die Workspace-Regeln, Admins sind ausgenommen', async () => {
    const svc = makeService(undefined, {
      security: { shareLinks: { requireExpiry: true, maxDays: 7, requirePassword: true } },
    });
    await expect(
      svc.validateAgainstPolicy(user(), { expiresAt: null, hasPassword: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.validateAgainstPolicy(user(), {
        expiresAt: new Date(Date.now() + 30 * 86400_000),
        hasPassword: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.validateAgainstPolicy(user(), {
        expiresAt: new Date(Date.now() + 3 * 86400_000),
        hasPassword: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.validateAgainstPolicy(user(), {
        expiresAt: new Date(Date.now() + 3 * 86400_000),
        hasPassword: true,
      }),
    ).resolves.toBeUndefined();
    await expect(
      svc.validateAgainstPolicy(user('admin'), { expiresAt: null, hasPassword: false }),
    ).resolves.toBeUndefined();
  });

  it('normalisiert die Regeln', () => {
    expect(normalizeShareLinkPolicy({ maxDays: 0 })).toEqual({
      requireExpiry: false,
      maxDays: null,
      requirePassword: false,
    });
  });
});
