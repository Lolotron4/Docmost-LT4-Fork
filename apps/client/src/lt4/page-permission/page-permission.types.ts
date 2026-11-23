// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export type PagePermissionRole = "reader" | "writer";

export interface IPagePermissionInfo {
  pageId: string;
  isRestricted: boolean;
  inheritedFrom: { id: string; slugId: string; title: string | null } | null;
  canManage: boolean;
}

interface IPagePermissionMemberBase {
  id: string;
  name: string;
  role: PagePermissionRole;
  createdAt: string;
}

export interface IPagePermissionUser extends IPagePermissionMemberBase {
  type: "user";
  email: string;
  avatarUrl: string | null;
}

export interface IPagePermissionGroup extends IPagePermissionMemberBase {
  type: "group";
  memberCount: number;
  isDefault: boolean;
}

export type IPagePermissionMember = IPagePermissionUser | IPagePermissionGroup;

export interface IPagePermissionTarget {
  pageId: string;
  userId?: string;
  groupId?: string;
}
