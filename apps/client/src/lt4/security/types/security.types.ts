// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export interface IAuthProvider {
  id: string;
  name: string;
  type: string;
  samlUrl?: string | null;
  samlCertificate?: string | null;
  oidcIssuer?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync?: boolean;
  workspaceId?: string;
  creatorId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
