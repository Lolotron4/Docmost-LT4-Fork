// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  IPagePermissionInfo,
  IPagePermissionMember,
  IPagePermissionTarget,
  PagePermissionRole,
} from "./page-permission.types";

export async function getPagePermissionInfo(
  pageId: string,
): Promise<IPagePermissionInfo> {
  const req = await api.post<IPagePermissionInfo>("/page-permissions/info", {
    pageId,
  });
  return req.data;
}

export async function getPagePermissionMembers(
  pageId: string,
): Promise<IPagination<IPagePermissionMember>> {
  const req = await api.post<IPagination<IPagePermissionMember>>(
    "/page-permissions/members",
    { pageId, limit: 100 },
  );
  return req.data;
}

export async function restrictPage(pageId: string): Promise<IPagePermissionInfo> {
  const req = await api.post<IPagePermissionInfo>("/page-permissions/restrict", {
    pageId,
  });
  return req.data;
}

export async function unrestrictPage(
  pageId: string,
): Promise<IPagePermissionInfo> {
  const req = await api.post<IPagePermissionInfo>(
    "/page-permissions/unrestrict",
    { pageId },
  );
  return req.data;
}

export async function addPagePermissions(data: {
  pageId: string;
  userIds: string[];
  groupIds: string[];
  role: PagePermissionRole;
}): Promise<void> {
  await api.post("/page-permissions/add", data);
}

export async function removePagePermission(
  data: IPagePermissionTarget,
): Promise<void> {
  await api.post("/page-permissions/remove", data);
}

export async function updatePagePermissionRole(
  data: IPagePermissionTarget & { role: PagePermissionRole },
): Promise<void> {
  await api.post("/page-permissions/role", data);
}
