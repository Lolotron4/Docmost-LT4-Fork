// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type VerificationType = "expiring" | "qms";
export type PeriodUnit = "day" | "week" | "month" | "year";
export type VerificationState =
  | "unverified"
  | "verified"
  | "expiring"
  | "expired"
  | "changed"
  | "draft"
  | "in_approval"
  | "approved"
  | "rejected";

export type UserRef = { id: string; name: string | null; avatarUrl: string | null };

export interface IPageVerificationInfo {
  pageId: string;
  verification: null | {
    id: string;
    type: VerificationType;
    state: VerificationState;
    periodAmount: number | null;
    periodUnit: PeriodUnit | null;
    verifiedAt: string | null;
    verifiedBy: UserRef | null;
    expiresAt: string | null;
    requestedAt: string | null;
    requestedBy: UserRef | null;
    rejectedAt: string | null;
    rejectedBy: UserRef | null;
    rejectionComment: string | null;
    invalidatedAt: string | null;
    invalidatedBy: UserRef | null;
    createdAt: string;
  };
  verifiers: UserRef[];
  permissions: {
    canManage: boolean;
    canVerify: boolean;
    canRequest: boolean;
    isVerifier: boolean;
  };
}

export interface IVerificationListItem {
  id: string;
  pageId: string;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  title: string | null;
  icon: string | null;
  slugId: string;
  type: VerificationType;
  state: VerificationState;
  verifiedAt: string | null;
  expiresAt: string | null;
  requestedAt: string | null;
  requestedBy: UserRef | null;
  updatedAt: string;
  verifiers: UserRef[];
  isVerifier: boolean;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getVerificationInfo = (pageId: string) =>
  post<IPageVerificationInfo>("/page-verification/info", { pageId });
export const getVerifierCandidates = (pageId: string, query?: string) =>
  post<UserRef[]>("/page-verification/candidates", { pageId, query });
export const setupVerification = (data: {
  pageId: string;
  type: VerificationType;
  verifierIds: string[];
  periodAmount?: number | null;
  periodUnit?: PeriodUnit | null;
}) => post<IPageVerificationInfo>("/page-verification/setup", data);
export const removeVerification = (pageId: string) =>
  post<{ success: boolean }>("/page-verification/remove", { pageId });

type Action = "verify" | "request" | "withdraw" | "approve";
export const verificationAction = (action: Action, pageId: string) =>
  post<IPageVerificationInfo>(`/page-verification/${action}`, { pageId });
export const rejectVerification = (pageId: string, comment?: string) =>
  post<IPageVerificationInfo>("/page-verification/reject", { pageId, comment });

export const listVerifications = (params: {
  filter?: "mine" | "all";
  state?: VerificationState;
  spaceId?: string;
}) => post<{ items: IVerificationListItem[] }>("/page-verification/list", params);
