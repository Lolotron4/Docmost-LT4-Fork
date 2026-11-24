// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export interface IMfaStatus {
  isEnabled: boolean;
  method: "totp";
  backupCodesRemaining: number;
  isEnforced: boolean;
}

export interface IMfaSetup {
  secret: string;
  otpauthUrl: string;
  qrCode: string;
}

export interface IMfaLoginInfo {
  userHasMfa: boolean;
  requiresMfaSetup: boolean;
  isMfaEnforced: boolean;
}

type BackupCodes = { backupCodes: string[] };

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

// Kontoeinstellungen (angemeldet)
export const getMfaStatus = () => post<IMfaStatus>("/mfa/status");
export const setupMfa = () => post<IMfaSetup>("/mfa/setup");
export const enableMfa = (code: string) =>
  post<BackupCodes>("/mfa/enable", { code });
export const disableMfa = (code: string) =>
  post<void>("/mfa/disable", { code });
export const regenerateBackupCodes = (code: string) =>
  post<BackupCodes>("/mfa/backup-codes", { code });
export const resetMemberMfa = (userId: string) =>
  post<void>("/mfa/reset-user", { userId });

// Login-Schritt (mit MFA-Cookie)
export const getMfaLoginInfo = () =>
  post<IMfaLoginInfo>("/mfa/login/info");
export const verifyMfaLogin = (code: string) =>
  post<void>("/mfa/login/verify", { code });
export const setupMfaLogin = () =>
  post<IMfaSetup>("/mfa/login/setup");
export const enableMfaLogin = (code: string) =>
  post<BackupCodes>("/mfa/login/enable", { code });

export function errorMessage(err: any, fallback: string): string {
  const message = err?.response?.data?.message;
  return Array.isArray(message) ? message[0] : message || fallback;
}
