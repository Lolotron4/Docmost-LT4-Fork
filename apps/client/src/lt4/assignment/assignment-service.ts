// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type SubmissionState = "open" | "submitted" | "locked" | "overdue" | "unlocked";

export interface IAssignmentOptions {
  canManageAll: boolean;
  spaces: { id: string; name: string; slug: string }[];
  groups: { id: string; name: string; memberCount: number }[];
}

export interface IAssignmentSummary {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  lockAfterDue: boolean;
  allowSubmit: boolean;
  templateId: string | null;
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string | null;
  parentPageSlugId: string | null;
  createdAt: string;
  creator: { id: string; name: string | null; avatarUrl: string | null } | null;
  canManage: boolean;
}

export interface IAssignmentListItem extends IAssignmentSummary {
  total: number;
  counts: Record<SubmissionState, number>;
}

export interface ISubmission {
  id: string;
  pageId: string;
  pageSlugId: string;
  pageTitle: string | null;
  pageUpdatedAt: string;
  target: { type: "group" | "user"; id: string; name: string | null };
  dueAt: string;
  hasOwnDue: boolean;
  lockDisabled: boolean;
  submittedAt: string | null;
  submittedByName: string | null;
  lockedAt: string | null;
  state: SubmissionState;
}

export interface IAssignmentDetail extends IAssignmentSummary {
  submissions: ISubmission[];
}

export interface ITodoItem {
  id: string;
  assignmentId: string;
  title: string;
  pageId: string;
  pageSlugId: string;
  pageTitle: string | null;
  spaceName: string;
  spaceSlug: string;
  groupName: string | null;
  dueAt: string;
  submittedAt: string | null;
  state: SubmissionState;
}

export interface IAssignmentPageInfo {
  assignment: null | {
    id: string;
    title: string;
    description: string | null;
    lockAfterDue: boolean;
    allowSubmit: boolean;
  };
  submission?: {
    id: string;
    dueAt: string;
    state: SubmissionState;
    submittedAt: string | null;
    lockedAt: string | null;
    targetName: string | null;
    targetType: "group" | "user";
  };
  isMember?: boolean;
  canManage?: boolean;
  canSubmit?: boolean;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body ?? {});
  return req.data;
}

export const getAssignmentOptions = () => post<IAssignmentOptions>("/assignments/options");
export const listAssignments = (scope: "mine" | "all") =>
  post<{ items: IAssignmentListItem[]; canManageAll: boolean }>("/assignments", { scope });
export const getAssignmentTodo = () => post<{ items: ITodoItem[] }>("/assignments/todo");
export const getAssignment = (assignmentId: string) =>
  post<IAssignmentDetail>("/assignments/info", { assignmentId });
export const createAssignment = (data: {
  title: string;
  description?: string | null;
  templateId?: string | null;
  spaceId: string;
  groupIds: string[];
  userIds: string[];
  dueAt: string;
  lockAfterDue: boolean;
  allowSubmit: boolean;
}) => post<IAssignmentDetail>("/assignments/create", data);
export const updateAssignment = (data: {
  assignmentId: string;
  title?: string;
  description?: string | null;
  dueAt?: string;
  lockAfterDue?: boolean;
  allowSubmit?: boolean;
}) => post<IAssignmentDetail>("/assignments/update", data);
export const deleteAssignment = (assignmentId: string) =>
  post<{ success: boolean }>("/assignments/delete", { assignmentId });
export const getAssignmentPageInfo = (pageId: string) =>
  post<IAssignmentPageInfo>("/assignments/page-info", { pageId });
export const submitAssignment = (submissionId: string) =>
  post<IAssignmentPageInfo>("/assignments/submit", { submissionId });
export const unlockSubmissions = (submissionIds: string[], dueAt?: string | null) =>
  post<{ updated: number }>("/assignments/unlock", { submissionIds, dueAt: dueAt ?? null });
export const extendSubmissions = (submissionIds: string[], dueAt: string) =>
  post<{ updated: number }>("/assignments/extend", { submissionIds, dueAt });
export const lockSubmissions = (submissionIds: string[]) =>
  post<{ updated: number }>("/assignments/lock", { submissionIds });
