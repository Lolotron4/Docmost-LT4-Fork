// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";
import { IApiKey } from "./index";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const listApiKeys = (all = false) => post<IApiKey[]>("/api-keys", { all });
export const createApiKey = (data: { name: string; expiresAt?: string; access?: "read" | "write" }) =>
  post<{ apiKey: IApiKey; token: string }>("/api-keys/create", data);
export const renameApiKey = (apiKeyId: string, name: string) =>
  post<IApiKey>("/api-keys/update", { apiKeyId, name });
export const revokeApiKey = (apiKeyId: string) => post<void>("/api-keys/revoke", { apiKeyId });
