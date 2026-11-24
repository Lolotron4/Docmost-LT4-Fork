// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export interface IApiKey {
  id: string;
  name: string;
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  scopes?: string[];
  creatorId?: string;
  creatorName?: string | null;
}
