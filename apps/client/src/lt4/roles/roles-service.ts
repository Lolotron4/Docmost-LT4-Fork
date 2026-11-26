// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import api from "@/lib/api-client";
import { Lt4Permission } from "./role-permissions";

export interface ILt4Role {
  key: string;
  name: string;
  description: string | null;
  permissions: Lt4Permission[];
  isSystem: boolean;
  rank: number;
  userCount: number;
  editable: boolean;
  assignable: boolean;
  groups?: { id: string; name: string }[];
}

export interface ILt4RolesResponse {
  permissions: Lt4Permission[];
  myRole: string;
  myRoles?: string[];
  groupRoles?: { groupId: string; groupName: string; roleKey: string }[];
  myPermissions: Lt4Permission[];
  roles: ILt4Role[];
}

export async function getRoles(): Promise<ILt4RolesResponse> {
  const req = await api.post<ILt4RolesResponse>("/roles");
  return req.data;
}

export async function createRole(data: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<ILt4RolesResponse> {
  const req = await api.post<ILt4RolesResponse>("/roles/create", data);
  return req.data;
}

export async function updateRole(data: {
  key: string;
  name?: string;
  description?: string;
  permissions?: string[];
}): Promise<ILt4RolesResponse> {
  const req = await api.post<ILt4RolesResponse>("/roles/update", data);
  return req.data;
}

export async function moveRole(data: {
  key: string;
  direction: "up" | "down";
}): Promise<ILt4RolesResponse> {
  const req = await api.post<ILt4RolesResponse>("/roles/move", data);
  return req.data;
}

export async function setGroupRole(data: {
  groupId: string;
  roleKey: string | null;
}): Promise<ILt4RolesResponse> {
  const req = await api.post<ILt4RolesResponse>("/roles/group-role", data);
  return req.data;
}

export async function deleteRole(data: {
  key: string;
  replacementKey?: string;
}): Promise<ILt4RolesResponse> {
  const req = await api.post<ILt4RolesResponse>("/roles/delete", data);
  return req.data;
}
