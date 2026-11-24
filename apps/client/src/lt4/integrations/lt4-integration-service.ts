// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type Lt4IntegrationStatus = {
  type: string;
  oauthConfigured: boolean;
  publicPreviews: boolean;
  envKeys: string[];
};

export async function getLt4IntegrationStatus(): Promise<
  Lt4IntegrationStatus[]
> {
  const req = await api.post<Lt4IntegrationStatus[]>("/integrations/lt4/status");
  return req.data;
}

export async function installWithoutOAuth(type: string): Promise<void> {
  await api.post("/integrations/lt4/install", { type });
}
