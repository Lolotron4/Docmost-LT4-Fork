// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export interface ILdapProvider {
  id: string;
  name: string;
  url: string;
  bindDn: string | null;
  hasBindPassword: boolean;
  baseDn: string;
  userSearchFilter: string;
  usernameAttribute: string;
  emailAttribute: string;
  nameAttribute: string;
  startTls: boolean;
  caCert: string | null;
  allowSignup: boolean;
  isEnabled: boolean;
}

export type ILdapProviderInput = Partial<Omit<ILdapProvider, "id" | "hasBindPassword">> & {
  bindPassword?: string;
};

export interface ILdapTestResult {
  ok: boolean;
  message: string;
  user?: { dn: string; username: string | null; email: string | null; name: string | null };
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const listLdapProviders = () => post<{ items: ILdapProvider[] }>("/ldap/providers");
export const createLdapProvider = (data: ILdapProviderInput) =>
  post<{ id: string }>("/ldap/providers/create", data);
export const updateLdapProvider = (data: ILdapProviderInput & { id: string }) =>
  post<void>("/ldap/providers/update", data);
export const deleteLdapProvider = (id: string) => post<void>("/ldap/providers/delete", { id });
export const testLdapProvider = (id: string, username?: string) =>
  post<ILdapTestResult>("/ldap/providers/test", { id, ...(username ? { username } : {}) });

export const ldapLogin = (providerId: string, username: string, password: string) =>
  post<{ userHasMfa?: boolean; requiresMfaSetup?: boolean }>(`/ldap/${providerId}/login`, {
    username,
    password,
  });
