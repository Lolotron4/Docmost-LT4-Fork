// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";

export type AnnouncementColor = "blue" | "green" | "yellow" | "red" | "gray";
export type AnnouncementAudience = "members" | "everyone";

export interface IAnnouncement {
  id: string;
  title: string;
  textContent: string;
  color: AnnouncementColor;
  audience: AnnouncementAudience;
  isDismissible: boolean;
  startsAt: string;
  endsAt: string | null;
  updatedAt: string;
  archivedAt?: string | null;
  createdAt?: string;
  creatorName?: string | null;
}

export type AnnouncementInput = {
  title?: string;
  text?: string;
  color?: AnnouncementColor;
  audience?: AnnouncementAudience;
  isDismissible?: boolean;
  startsAt?: string;
  endsAt?: string | null;
};

async function post<T>(url: string, body?: unknown): Promise<T> {
  const req = await api.post<T>(url, body);
  return req.data;
}

export const getCurrentAnnouncements = () => post<IAnnouncement[]>("/announcements/current");
export const getPublicAnnouncements = () => post<IAnnouncement[]>("/announcements/public");
export const listAnnouncements = (archived = false) =>
  post<IAnnouncement[]>("/announcements", { archived });
export const createAnnouncement = (data: AnnouncementInput & { title: string }) =>
  post<IAnnouncement>("/announcements/create", data);
export const updateAnnouncement = (data: AnnouncementInput & { announcementId: string }) =>
  post<IAnnouncement>("/announcements/update", data);
export const archiveAnnouncement = (announcementId: string, archived: boolean) =>
  post<IAnnouncement>("/announcements/archive", { announcementId, archived });
export const deleteAnnouncement = (announcementId: string) =>
  post<void>("/announcements/delete", { announcementId });
