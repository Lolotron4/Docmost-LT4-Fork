// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type UserRef = { id: string; name: string | null; avatarUrl: string | null };

export interface IPageStats {
  pageId: string;
  days: number;
  retentionDays: number;
  canSeeNames: boolean;
  views: number;
  viewers: number;
  lastViewedAt: string | null;
  allTime: { views: number; viewers: number; lastViewedAt: string | null; since: string | null };
  series: { day: string; views: number; viewers: number }[];
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: UserRef | null;
  audienceSize: number | null;
  readers: { user: UserRef; views: number; lastViewedAt: string }[] | null;
  notOpened: UserRef[] | null;
}

export interface IStalePage {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  isBase: boolean;
  updatedAt: string;
  createdAt: string;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  lastUpdatedById: string | null;
  lastUpdatedByName: string | null;
  lastUpdatedByAvatarUrl: string | null;
  views90: number;
  lastViewedAt: string | null;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const recordPageView = (pageId: string) =>
  post<{ recorded: boolean }>("/page-stats/view", { pageId });
export const getPageStats = (pageId: string, days: number) =>
  post<IPageStats>("/page-stats/page", { pageId, days });
export const getStalePages = (data: { days: number; spaceId?: string | null; mine?: boolean }) =>
  post<{ days: number; items: IStalePage[] }>("/page-stats/stale", data);
