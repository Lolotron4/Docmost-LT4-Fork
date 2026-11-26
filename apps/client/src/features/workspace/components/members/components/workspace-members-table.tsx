import { Anchor, Group, Table, Text, Badge } from "@mantine/core";
import {
  useChangeMemberRoleMutation,
  useWorkspaceMembersQuery,
} from "@/features/workspace/queries/workspace-query.ts";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import React, { useState } from "react";
import RoleSelectMenu from "@/components/ui/role-select-menu.tsx";
import { useRoleLabels } from "@/lt4/roles/use-roles";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useMfaMembers } from "@/lt4/mfa/use-mfa-members";
import { MfaMemberBadge } from "@/lt4/mfa/components/mfa-member-badge";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate.tsx";
import { SearchInput } from "@/components/common/search-input.tsx";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search.tsx";
import MemberActionMenu from "@/features/workspace/components/members/components/members-action-menu.tsx";
import MemberStatusFilter from "@/features/workspace/components/members/components/member-status-filter.tsx";
import { MemberListStatus } from "@/features/workspace/types/workspace.types.ts";
import { Link } from "react-router-dom";
import { getUserProfileUrl } from "@/lib/config.ts";
import { formatLocalized, useDateFnsLocale } from "@/lib/date-locale.ts";
import rowClasses from "@/components/ui/clickable-table-row.module.css";
import { displayEmail } from "@/lt4/accounts/username";

export default function WorkspaceMembersTable() {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const { search, cursor, goNext, goPrev, handleSearch, resetPagination } =
    usePaginateAndSearch();
  const [status, setStatus] = useState<MemberListStatus>("active");
  const { data, isLoading } = useWorkspaceMembersQuery({
    cursor,
    limit: 100,
    query: search,
    status,
  });
  const changeMemberRoleMutation = useChangeMemberRoleMutation();
  const { can } = useUserRole();
  const isAdmin = can("members");
  const { labelOf, assignableRoles, canManageRole } = useRoleLabels();
  const mfaUserIds = useMfaMembers(isAdmin);

  const handleStatusChange = (value: MemberListStatus) => {
    setStatus(value);
    resetPagination();
  };

  // LT4-Fork: nur Rollen unter der eigenen (Owner: alle)
  const assignableUserRoles = assignableRoles({ withOwner: true });

  const handleRoleChange = async (
    userId: string,
    currentRole: string,
    newRole: string,
  ) => {
    if (newRole === currentRole) {
      return;
    }

    const memberRoleUpdate = {
      userId: userId,
      role: newRole,
    };

    await changeMemberRoleMutation.mutateAsync(memberRoleUpdate);
  };

  return (
    <>
      <Group gap="sm" align="flex-start">
        <SearchInput onSearch={handleSearch} />
        {isAdmin && (
          <MemberStatusFilter status={status} onChange={handleStatusChange} />
        )}
      </Group>
      <Table.ScrollContainer minWidth={600}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("User")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Role")}</Table.Th>
              <Table.Th aria-label={t("Action")} />
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {data?.items.length > 0 ? (
              data?.items.map((user, index) => (
                <Table.Tr key={index} className={rowClasses.row}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <CustomAvatar
                        avatarUrl={user.avatarUrl}
                        name={user.name}
                      />
                      <div>
                        {user.deletedAt ? (
                          <Text fz="sm" fw={500} lineClamp={1}>
                            {user.name}
                          </Text>
                        ) : (
                          <Anchor
                            component={Link}
                            to={getUserProfileUrl(user.id)}
                            size="sm"
                            fw={500}
                            underline="never"
                            lineClamp={1}
                            className={rowClasses.link}
                            style={{ color: "var(--mantine-color-text)" }}
                          >
                            {user.name}
                          </Anchor>
                        )}
                        <Text fz="xs" c="dimmed">
                          {user.deletedAt
                            ? t("Deleted on {{date}}", {
                                date: formatLocalized(
                                  user.deletedAt,
                                  "MMM d, yyyy",
                                  "PP",
                                  locale,
                                ),
                              })
                            : displayEmail(user.email)}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {user.deletedAt ? (
                      <Badge variant="light" color="red">
                        {t("Deleted")}
                      </Badge>
                    ) : user.deactivatedAt ? (
                      <Badge variant="light" color="orange">
                        {t("Deactivated")}
                      </Badge>
                    ) : (
                      <Group gap={6} wrap="nowrap">
                        <Badge variant="light">{t("Active")}</Badge>
                        {mfaUserIds.has(user.id) && <MfaMemberBadge />}
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isAdmin && !user.deletedAt && canManageRole(user.role) ? (
                      <RoleSelectMenu
                        roles={assignableUserRoles}
                        roleName={labelOf(user.role)}
                        onChange={(newRole) =>
                          handleRoleChange(user.id, user.role, newRole)
                        }
                      />
                    ) : (
                      <Text fz="sm">{labelOf(user.role)}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isAdmin && !user.deletedAt && canManageRole(user.role) && (
                      <MemberActionMenu
                        userId={user.id}
                        name={user.name}
                        deactivatedAt={user.deactivatedAt}
                      />
                    )}
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={3} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data?.items.length > 0 && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
