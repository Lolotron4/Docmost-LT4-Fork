// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

export interface ITask {
  id: string;
  pageId: string;
  itemId: string;
  text: string;
  checked: boolean;
  /** YYYY-MM-DD */
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  pageTitle: string | null;
  pageIcon: string | null;
  pageSlugId: string;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  assigneeId: string;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  assignedById: string | null;
  assignedByName: string | null;
  assignedByAvatarUrl: string | null;
}

export type TaskMode = "mine" | "assigned";
export type TaskStatus = "open" | "done";

export const TASKS_KEY = "lt4-tasks";
export const TASK_COUNTS_KEY = "lt4-task-counts";

export async function getTasks(mode: TaskMode, status: TaskStatus) {
  const req = await api.post<{ items: ITask[] }>("/tasks/list", { mode, status });
  return req.data;
}

export async function getTaskCounts() {
  const req = await api.post<{ open: number; due: number }>("/tasks/counts");
  return req.data;
}

export async function setTaskChecked(id: string, checked: boolean) {
  const req = await api.post<{ success: boolean }>("/tasks/set-checked", { id, checked });
  return req.data;
}

export function useTasks(mode: TaskMode, status: TaskStatus) {
  return useQuery({
    queryKey: [TASKS_KEY, mode, status],
    queryFn: () => getTasks(mode, status),
  });
}

export function useTaskCounts() {
  return useQuery({
    queryKey: [TASK_COUNTS_KEY],
    queryFn: getTaskCounts,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30 * 1000,
  });
}

export function useSetTaskChecked() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      setTaskChecked(id, checked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TASKS_KEY] });
      qc.invalidateQueries({ queryKey: [TASK_COUNTS_KEY] });
    },
    onError: () => {
      notifications.show({ color: "red", message: t("Could not update the task") });
      qc.invalidateQueries({ queryKey: [TASKS_KEY] });
    },
  });
}

/** Heutiges Datum (YYYY-MM-DD) in der Zeitzone des Browsers. */
export function todayString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type DueGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export function dueGroup(dueDate: string | null): DueGroup {
  if (!dueDate) return "none";
  const today = todayString();
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate === todayString(1)) return "tomorrow";
  if (dueDate <= todayString(7)) return "week";
  return "later";
}

export function formatDue(dueDate: string, language?: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: y === new Date().getFullYear() ? undefined : "numeric",
  });
}
