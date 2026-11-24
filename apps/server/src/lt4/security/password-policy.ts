// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Passwortregeln pro Workspace (gespeichert in workspaces.settings.security).
import { BadRequestException } from '@nestjs/common';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';

export type PasswordPolicy = {
  minLength: number;
  requireNumber: boolean;
  requireMixedCase: boolean;
  requireSymbol: boolean;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireNumber: false,
  requireMixedCase: false,
  requireSymbol: false,
};

export function normalizePolicy(raw: any): PasswordPolicy {
  const p = { ...DEFAULT_PASSWORD_POLICY, ...(raw ?? {}) };
  return {
    minLength: Math.min(64, Math.max(8, Number(p.minLength) || 8)),
    requireNumber: !!p.requireNumber,
    requireMixedCase: !!p.requireMixedCase,
    requireSymbol: !!p.requireSymbol,
  };
}

export async function getPasswordPolicy(
  db: KyselyDB | KyselyTransaction,
  workspaceId: string,
): Promise<PasswordPolicy> {
  const ws = await db
    .selectFrom('workspaces')
    .select('settings')
    .where('id', '=', workspaceId)
    .executeTakeFirst();
  return normalizePolicy((ws?.settings as any)?.security?.passwordPolicy);
}

/** Liefert die erste verletzte Regel oder null. */
export function checkPassword(password: string, policy: PasswordPolicy): string | null {
  if ((password ?? '').length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters long`;
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    return 'Password must contain a number';
  }
  if (policy.requireMixedCase && !(/[a-zäöü]/.test(password) && /[A-ZÄÖÜ]/.test(password))) {
    return 'Password must contain upper and lower case letters';
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9äöüÄÖÜß]/.test(password)) {
    return 'Password must contain a special character';
  }
  return null;
}

export async function assertPasswordPolicy(
  db: KyselyDB | KyselyTransaction,
  workspaceId: string,
  password: string,
): Promise<void> {
  const policy = await getPasswordPolicy(db, workspaceId);
  const problem = checkPassword(password, policy);
  if (problem) throw new BadRequestException(problem);
}
