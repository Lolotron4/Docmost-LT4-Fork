import { useId } from "react";
import { Button, Menu } from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconTrash,
  IconUserCheck,
  IconUserOff,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { RadioMenuItem } from "@/components/ui/radio-menu-item";
import { IUserProfile } from "@/features/user/types/user.types";
import { useMemberActions } from "@/features/workspace/hooks/use-member-actions";
import { useChangeMemberRoleMutation } from "@/features/workspace/queries/workspace-query";
import { useRoleLabels } from "@/lt4/roles/use-roles";
import useUserRole from "@/hooks/use-user-role";
import APP_ROUTE from "@/lib/app-route";

type UserProfileManageMenuProps = {
  profile: IUserProfile;
};

export function UserProfileManageMenu({ profile }: UserProfileManageMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const roleLabelId = useId();
  const { can } = useUserRole();
  const { roles, nameOf, canManageRole } = useRoleLabels();
  const changeMemberRoleMutation = useChangeMemberRoleMutation();
  const isDeactivated = !!profile.deactivatedAt;
  // LT4-Fork: nur Personen und Rollen unter der eigenen Rolle (Owner: alle)
  const canManage = can("members") && canManageRole(profile.role);

  const refreshProfile = () =>
    queryClient.invalidateQueries({ queryKey: ["user-profile", profile.id] });

  const { openDeactivateModal, openDeleteModal } = useMemberActions({
    userId: profile.id,
    isDeactivated,
    onStatusChange: refreshProfile,
    onDelete: () => {
      refreshProfile();
      navigate(APP_ROUTE.SETTINGS.WORKSPACE.MEMBERS);
    },
  });

  const handleRoleChange = (role: string) => {
    if (role === profile.role) return;
    changeMemberRoleMutation.mutate(
      { userId: profile.id, role },
      { onSuccess: refreshProfile },
    );
  };

  return (
    <Menu shadow="md" position="bottom-end" width={220}>
      <Menu.Target>
        <Button
          variant="default"
          rightSection={<IconChevronDown size={16} aria-hidden />}
        >
          {t("Manage user")}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label id={roleLabelId}>{t("Role")}</Menu.Label>
        <div role="group" aria-labelledby={roleLabelId}>
          {roles.map((role) => {
            const checked = profile.role === role.key;
            return (
              <Menu.Item
                key={role.key}
                component={RadioMenuItem}
                aria-checked={checked}
                disabled={!canManage || !role.assignable}
                onClick={() => handleRoleChange(role.key)}
                rightSection={checked && <IconCheck size={20} aria-hidden />}
              >
                {nameOf(role)}
              </Menu.Item>
            );
          })}
        </div>

        <Menu.Divider />

        <Menu.Item
          onClick={openDeactivateModal}
          leftSection={
            isDeactivated ? (
              <IconUserCheck size={16} />
            ) : (
              <IconUserOff size={16} />
            )
          }
          disabled={!canManage}
        >
          {isDeactivated ? t("Activate member") : t("Deactivate member")}
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          c="red"
          onClick={openDeleteModal}
          leftSection={<IconTrash size={16} />}
          disabled={!canManage}
        >
          {t("Delete member")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
