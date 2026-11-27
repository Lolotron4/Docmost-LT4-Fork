// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export interface IScimToken {
  id: string;
  name: string;
  tokenLastFour: string;
  lastUsedAt: string | null;
  isEnabled: boolean;
  creatorId: string | null;
  creatorName: string | null;
  createdAt: string;
}

export interface IScimOverview {
  enabled: boolean;
  tokens: IScimToken[];
  managedUsers: number;
  managedGroups: number;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getScimOverview = () => post<IScimOverview>("/lt4/scim");
export const setScimEnabled = (enabled: boolean) =>
  post<{ enabled: boolean }>("/lt4/scim/enabled", { enabled });
export const createScimToken = (name: string) =>
  post<{ token: string; scimToken: IScimToken }>("/lt4/scim/tokens/create", { name });
export const setScimTokenEnabled = (tokenId: string, enabled: boolean) =>
  post<void>("/lt4/scim/tokens/enabled", { tokenId, enabled });
export const deleteScimToken = (tokenId: string) =>
  post<void>("/lt4/scim/tokens/delete", { tokenId });

/** Basis-URL, die im Identitätsanbieter eingetragen wird. */
export const scimBaseUrl = () => `${window.location.origin}/api/scim/v2`;
