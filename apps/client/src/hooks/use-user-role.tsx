import { useAtom } from "jotai";
import { UserRole } from "@/lib/types.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import {
  fallbackPermissions,
  Lt4Permission,
} from "@/lt4/roles/role-permissions";

// LT4-Fork: Rechte kommen aus der Rolle (eingebaut oder selbst angelegt).
// isAdmin bedeutet hier "darf Arbeitsbereich-Einstellungen verwalten".
export const useUserRole = () => {
  const [currentUser] = useAtom(currentUserAtom);
  const role = currentUser?.user?.role;

  const isOwner = role === UserRole.OWNER;
  const permissions: string[] =
    currentUser?.permissions ?? fallbackPermissions(role);

  const can = (permission: Lt4Permission) =>
    isOwner || permissions.includes(permission);

  const isAdmin = can("settings");
  const isMember = role === UserRole.MEMBER;

  return { isAdmin, isOwner, isMember, can, permissions, role };
};

export default useUserRole;
