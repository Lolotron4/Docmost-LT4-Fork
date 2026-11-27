// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Badge, Group, Select, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import { setGroupRole } from "./roles-service";
import { useRoleLabels, useSetRolesData } from "./use-roles";

/** Rolle einer Gruppe: alle Mitglieder bekommen deren Rechte dazu. */
export function GroupRoleSelect({
  groupId,
  fullWidth,
}: {
  groupId: string;
  fullWidth?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = useUserRole();
  const queryClient = useQueryClient();
  const setRolesData = useSetRolesData();
  const { data, roles, nameOf } = useRoleLabels();

  const current =
    data?.groupRoles?.find((g) => g.groupId === groupId)?.roleKey ?? null;
  const currentRole = roles.find((r) => r.key === current);
  // Nur Rollen unter der eigenen; eine höhere aktuelle Rolle sperrt die Auswahl.
  const canChange =
    can("members") && (!current || !!currentRole?.assignable);

  const options = [
    { value: "", label: t("No role") },
    ...roles
      .filter((r) => r.key !== "owner" && r.key !== "member")
      .filter((r) => r.assignable || r.key === current)
      .map((r) => ({ value: r.key, label: nameOf(r) })),
  ];

  const change = async (value: string | null) => {
    try {
      setRolesData(await setGroupRole({ groupId, roleKey: value || null }));
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    } catch (err: any) {
      notifications.show({
        message: t(err?.response?.data?.message ?? "Error"),
        color: "red",
      });
    }
  };

  if (!can("members") && !current) return null;

  return (
    <Group gap="xs" align="flex-end" grow={fullWidth}>
      <Select
        label={t("Group role")}
        description={t("All members of this group get the rights of this role.")}
        data={options}
        value={current ?? ""}
        onChange={change}
        disabled={!canChange}
        allowDeselect={false}
        w={fullWidth ? "100%" : 340}
        variant={fullWidth ? "filled" : "default"}
      />
      {current && !canChange && (
        <Text size="xs" c="dimmed">
          {t("Only roles below your own role can be edited")}
        </Text>
      )}
    </Group>
  );
}

/** Kleines Abzeichen mit der Rolle einer Gruppe (für Listen). */
export function GroupRoleBadge({ groupId }: { groupId: string }) {
  const { data, roles, nameOf } = useRoleLabels();
  const key = data?.groupRoles?.find((g) => g.groupId === groupId)?.roleKey;
  const role = roles.find((r) => r.key === key);
  if (!role) return null;
  return (
    <Badge size="xs" variant="light" ml={6}>
      {nameOf(role)}
    </Badge>
  );
}
