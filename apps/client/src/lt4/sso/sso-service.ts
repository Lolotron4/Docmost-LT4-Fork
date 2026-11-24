// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type SsoPreset = "oidc" | "google" | "microsoft" | "discord";

export interface ISsoProvider {
  id: string;
  name: string;
  preset: SsoPreset;
  issuer: string | null;
  tenant: string | null;
  clientId: string;
  hasClientSecret: boolean;
  allowSignup: boolean;
  isEnabled: boolean;
  callbackUrl: string;
}

export interface ISsoProviderInput {
  preset: SsoPreset;
  name: string;
  issuer?: string;
  tenant?: string;
  clientId: string;
  clientSecret: string;
  allowSignup?: boolean;
  isEnabled?: boolean;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const listSsoProviders = () => post<{ items: ISsoProvider[] }>("/sso/providers");
export const createSsoProvider = (data: ISsoProviderInput) =>
  post<{ id: string; callbackUrl: string }>("/sso/providers/create", data);
export const updateSsoProvider = (data: Partial<ISsoProviderInput> & { id: string }) =>
  post<void>("/sso/providers/update", data);
export const deleteSsoProvider = (id: string) => post<void>("/sso/providers/delete", { id });

export const listLinkedAccounts = () =>
  post<{ items: { providerId: string; providerName: string; createdAt: string }[] }>(
    "/sso/accounts",
  );
export const unlinkAccount = (id: string) => post<void>("/sso/accounts/unlink", { id });

/** Startadresse für die Anmeldung (volle Seitennavigation, kein XHR). */
export function ssoLoginUrl(
  providerId: string,
  opts: { mode?: "login" | "join" | "link"; redirect?: string; code?: string } = {},
) {
  const params = new URLSearchParams();
  if (opts.mode) params.set("mode", opts.mode);
  if (opts.redirect) params.set("redirect", opts.redirect);
  if (opts.code) params.set("code", opts.code);
  const query = params.toString();
  return `/api/sso/${providerId}/login${query ? `?${query}` : ""}`;
}
