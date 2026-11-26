// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Gastlinks: Ablaufdatum und Passwort für öffentliche Freigaben.
import api from "@/lib/api-client";

export type ShareGuardSettings = {
  expiresAt: string | null;
  hasPassword: boolean;
  expired: boolean;
};

export type ShareLinkPolicy = {
  requireExpiry: boolean;
  maxDays: number | null;
  requirePassword: boolean;
};

export type ShareLinkPolicyForUser = ShareLinkPolicy & { canBypass: boolean };

export const SHARE_PASSWORD_REQUIRED = "LT4_SHARE_PASSWORD_REQUIRED";
export const SHARE_EXPIRED = "LT4_SHARE_EXPIRED";
export const MIN_SHARE_PASSWORD_LENGTH = 4;

export async function getShareGuardSettings(shareId: string) {
  return (await api.post<ShareGuardSettings>("/lt4-shares/settings", { shareId })).data;
}

export async function updateShareGuard(data: {
  shareId: string;
  expiresAt?: string | null;
  password?: string | null;
}) {
  return (await api.post<ShareGuardSettings>("/lt4-shares/update", data)).data;
}

export async function unlockShare(shareId: string, password: string) {
  await api.post("/lt4-shares/unlock", { shareId, password });
}

export async function getShareLinkPolicy() {
  return (await api.post<ShareLinkPolicyForUser>("/lt4-shares/policy")).data;
}

export async function updateShareLinkPolicy(policy: ShareLinkPolicy) {
  return (await api.post<ShareLinkPolicy>("/lt4-shares/policy/update", policy)).data;
}

export type ShareBlock = { kind: "password" | "expired"; shareId: string | null };

/** Erkennt, ob ein Fehler einer öffentlichen Freigabe vom Gastlink-Schutz kommt. */
export function getShareBlock(error: unknown): ShareBlock | null {
  const data = (error as any)?.response?.data;
  if (!data || typeof data !== "object") return null;
  if (data.error === SHARE_PASSWORD_REQUIRED) {
    return { kind: "password", shareId: data.shareId ?? null };
  }
  if (data.error === SHARE_EXPIRED) {
    return { kind: "expired", shareId: data.shareId ?? null };
  }
  return null;
}

export const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};
