// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export interface IJoinLink {
  id: string;
  code: string;
  role: "member" | "admin";
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
  creatorName?: string | null;
  isActive?: boolean;
}

export interface IJoinLinkInfo {
  valid: boolean;
  reason: string | null;
  workspaceName: string;
  role: string | null;
}

export interface IJoinRegister {
  code: string;
  method: "email" | "username";
  name: string;
  email?: string;
  username?: string;
  password: string;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const listJoinLinks = () => post<{ items: IJoinLink[] }>("/join-links/list");
export const createJoinLink = (data: {
  role: "member" | "admin";
  maxUses?: number;
  expiresInDays?: number;
}) => post<IJoinLink>("/join-links/create", data);
export const revokeJoinLink = (id: string) => post<void>("/join-links/revoke", { id });
export const getJoinLinkInfo = (code: string) =>
  post<IJoinLinkInfo>("/join-links/info", { code });
export const registerWithJoinLink = (data: IJoinRegister) =>
  post<{ requiresLogin: boolean }>("/join-links/register", data);
export const setMemberPassword = (userId: string, password: string) =>
  post<{ isUsernameAccount: boolean }>("/join-links/set-member-password", {
    userId,
    password,
  });

export function joinLinkUrl(code: string) {
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}
