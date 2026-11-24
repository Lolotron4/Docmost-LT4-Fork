// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { MfaService } from './mfa.service';
import { buildTotp, encryptSecret, hashBackupCode } from './mfa.util';

const APP_SECRET = 'x'.repeat(40);
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const workspace: any = { id: 'ws-1', name: 'Schule', enforceMfa: false };
const user: any = { id: 'u-1', email: 'a@b.de', workspaceId: 'ws-1' };

function setup(row?: any) {
  const store = new Map<string, any>();
  const cache: any = {
    get: jest.fn(async (k) => store.get(k)),
    set: jest.fn(async (k, v) => void store.set(k, v)),
    del: jest.fn(async (k) => void store.delete(k)),
  };
  const updates: any[] = [];
  const chain: any = {
    set: (v: any) => (updates.push(v), chain),
    where: () => chain,
    values: () => chain,
    onConflict: () => chain,
    select: () => chain,
    execute: jest.fn(async () => undefined),
    executeTakeFirst: jest.fn(async () => row),
  };
  const db: any = {
    selectFrom: () => chain,
    updateTable: () => chain,
    insertInto: () => chain,
    deleteFrom: () => ({ ...chain, executeTakeFirst: async () => ({ numDeletedRows: 1n }) }),
  };
  const userRepo: any = {
    findByEmail: jest.fn(),
    findById: jest.fn(async () => user),
    updateLastLogin: jest.fn(),
  };
  const sessionService: any = { createSessionAndToken: jest.fn(async () => 'auth-token') };
  const tokenService: any = {
    generateMfaToken: jest.fn(async () => 'mfa-token'),
    verifyJwt: jest.fn(async () => ({ sub: user.id, workspaceId: 'ws-1' })),
  };
  const env: any = {
    getAppSecret: () => APP_SECRET,
    isCloud: () => false,
    isHttps: () => true,
    getCookieExpiresIn: () => new Date(),
  };
  const ability: any = {
    createForUser: () => ({ cannot: () => false }),
  };
  const audit: any = { log: jest.fn(), setActorId: jest.fn() };
  const service = new MfaService(db, userRepo, sessionService, tokenService, env, ability, cache, audit);
  return { service, updates, userRepo, tokenService, sessionService, cache };
}

const enabledRow = () => ({
  id: 'mfa-1',
  userId: user.id,
  secret: encryptSecret(SECRET, APP_SECRET),
  isEnabled: true,
  backupCodes: [hashBackupCode('abcde-fghjk')],
});
const res = () => ({ setCookie: jest.fn(), clearCookie: jest.fn() }) as any;
const req: any = { cookies: { mfaToken: 'mfa-token' } };

describe('MfaService (LT4)', () => {
  it('Login ohne 2FA: Sitzung direkt erzeugen', async () => {
    const { service, userRepo } = setup();
    const bcrypt = await import('bcrypt');
    userRepo.findByEmail.mockResolvedValue({ ...user, password: await bcrypt.hash('pw123456', 4), mfa: null });
    const r = res();
    await expect(
      service.checkMfaRequirements({ email: user.email, password: 'pw123456' }, workspace, r),
    ).resolves.toEqual({ authToken: 'auth-token' });
    expect(r.setCookie).not.toHaveBeenCalled();
  });

  it('Login mit 2FA: nur MFA-Cookie, keine Sitzung', async () => {
    const { service, userRepo, sessionService } = setup();
    const bcrypt = await import('bcrypt');
    userRepo.findByEmail.mockResolvedValue({ ...user, password: await bcrypt.hash('pw123456', 4), mfa: { isEnabled: true } });
    const r = res();
    const out = await service.checkMfaRequirements({ email: user.email, password: 'pw123456' }, workspace, r);
    expect(out).toEqual({ userHasMfa: true, requiresMfaSetup: false, isMfaEnforced: false });
    expect(r.setCookie).toHaveBeenCalledWith('mfaToken', 'mfa-token', expect.any(Object));
    expect(sessionService.createSessionAndToken).not.toHaveBeenCalled();
  });

  it('falsches Passwort bleibt ein Fehler, auch mit 2FA', async () => {
    const { service, userRepo } = setup();
    const bcrypt = await import('bcrypt');
    userRepo.findByEmail.mockResolvedValue({ ...user, password: await bcrypt.hash('richtig1', 4), mfa: { isEnabled: true } });
    await expect(
      service.checkMfaRequirements({ email: user.email, password: 'falsch12' }, workspace, res()),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('verify: gültiger Code meldet an, derselbe Code kein zweites Mal', async () => {
    const { service } = setup(enabledRow());
    const code = buildTotp(SECRET).generate();
    const r = res();
    await service.loginVerify(req, r, workspace, code);
    expect(r.setCookie).toHaveBeenCalledWith('authToken', 'auth-token', expect.any(Object));
    expect(r.clearCookie).toHaveBeenCalledWith('mfaToken', expect.any(Object));
    await expect(service.loginVerify(req, res(), workspace, code)).rejects.toThrow(BadRequestException);
  });

  it('verify: Backup-Code funktioniert und wird verbraucht', async () => {
    const { service, updates } = setup(enabledRow());
    await service.loginVerify(req, res(), workspace, 'ABCDE FGHJK');
    expect(updates[0].backupCodes).toEqual([]);
  });

  it('verify: nach 5 Fehlversuchen gesperrt', async () => {
    const { service } = setup(enabledRow());
    for (let i = 0; i < 5; i++) {
      await expect(service.loginVerify(req, res(), workspace, '000000')).rejects.toThrow(BadRequestException);
    }
    const code = buildTotp(SECRET).generate();
    await expect(service.loginVerify(req, res(), workspace, code)).rejects.toThrow(HttpException);
  });

  it('verify: ohne MFA-Cookie kein Zugang', async () => {
    const { service } = setup(enabledRow());
    await expect(service.loginVerify({ cookies: {} } as any, res(), workspace, '123456')).rejects.toThrow(UnauthorizedException);
  });

  it('enable: aktiviert nach gültigem Code und liefert 10 Backup-Codes', async () => {
    const { service, updates } = setup({ ...enabledRow(), isEnabled: false, backupCodes: null });
    const codes = await service.enable(user, workspace, buildTotp(SECRET).generate());
    expect(codes).toHaveLength(10);
    expect(updates[0].isEnabled).toBe(true);
    expect(updates[0].backupCodes).toHaveLength(10);
  });

  it('disable: bei 2FA-Pflicht im Workspace verboten', async () => {
    const { service } = setup(enabledRow());
    await expect(
      service.disable(user, { ...workspace, enforceMfa: true }, '123456'),
    ).rejects.toThrow(ForbiddenException);
  });
});
