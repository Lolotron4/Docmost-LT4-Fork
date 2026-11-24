// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

type UserRef = { id: string; name: string | null; avatarUrl: string | null };

export interface IReadConfirmationInfo {
  pageId: string;
  canManage: boolean;
  request: null | {
    id: string;
    message: string | null;
    dueAt: string | null;
    roundStartedAt: string;
    createdAt: string;
    requestedBy: UserRef | null;
  };
  mustConfirm?: boolean;
  myConfirmedAt?: string | null;
  stats?: { confirmed: number; total: number } | null;
}

export interface IPendingRead {
  id: string;
  pageId: string;
  message: string | null;
  dueAt: string | null;
  roundStartedAt: string;
  title: string | null;
  icon: string | null;
  slugId: string;
  spaceName: string;
  spaceSlug: string;
  requestedByName: string | null;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getReadInfo = (pageId: string) =>
  post<IReadConfirmationInfo>("/read-confirmations/info", { pageId });
export const requestRead = (data: {
  pageId: string;
  message?: string | null;
  dueAt?: string | null;
  notify?: boolean;
}) => post<IReadConfirmationInfo>("/read-confirmations/request", data);
export const askReadAgain = (pageId: string) =>
  post<IReadConfirmationInfo>("/read-confirmations/ask-again", { pageId });
export const remindRead = (pageId: string) =>
  post<{ reminded: number }>("/read-confirmations/remind", { pageId });
export const removeRead = (pageId: string) =>
  post<{ success: boolean }>("/read-confirmations/remove", { pageId });
export const confirmRead = (pageId: string) =>
  post<IReadConfirmationInfo>("/read-confirmations/confirm", { pageId });
export const getReadStatus = (pageId: string) =>
  post<{ items: { user: UserRef; confirmedAt: string | null }[] }>("/read-confirmations/status", { pageId });
export const getPendingReads = () =>
  post<{ items: IPendingRead[] }>("/read-confirmations/pending", {});
