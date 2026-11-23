// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useId, useState } from "react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle, IconLock, IconUsers, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IconGroupCircle } from "@/components/icons/icon-people-circle.tsx";
import { MultiMemberSelect } from "@/features/space/components/multi-member-select.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { IPage } from "@/features/page/types/page.types.ts";
import {
  usePagePermissionInfoQuery,
  usePagePermissionMembersQuery,
  usePagePermissionMutations,
} from "./page-permission-query";
import {
  IPagePermissionMember,
  PagePermissionRole,
} from "./page-permission.types";

interface PagePermissionModalProps {
  page: IPage;
  opened: boolean;
  onClose: () => void;
}

function splitMemberIds(ids: string[]) {
  const pick = (prefix: string) =>
    ids.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
  return { userIds: pick("user-"), groupIds: pick("group-") };
}

export function PagePermissionModal({
  page,
  opened,
  onClose,
}: PagePermissionModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { spaceSlug } = useParams();
  const { data: info, isLoading } = usePagePermissionInfoQuery(
    opened ? page.id : undefined,
  );
  const restricted = info?.isRestricted ?? false;
  const { data: members } = usePagePermissionMembersQuery(
    page.id,
    opened && restricted,
  );
  const mutations = usePagePermissionMutations(page.id, [page.id, page.slugId]);
  const canManage = info?.canManage ?? false;

  const roleOptions = [
    { value: "writer", label: t("Can edit") },
    { value: "reader", label: t("Can view") },
  ];

  const [selected, setSelected] = useState<string[]>([]);
  const [selectKey, setSelectKey] = useState(0);
  const [newRole, setNewRole] = useState<PagePermissionRole>("writer");

  const handleAccessChange = (value: string) => {
    if (value === "restricted" && !restricted) mutations.restrict.mutate(undefined);
    if (value === "space" && restricted) mutations.unrestrict.mutate(undefined);
  };

  const handleAdd = async () => {
    const { userIds, groupIds } = splitMemberIds(selected);
    if (userIds.length === 0 && groupIds.length === 0) return;
    await mutations.add.mutateAsync({
      pageId: page.id,
      userIds,
      groupIds,
      role: newRole,
    });
    setSelected([]);
    setSelectKey((key) => key + 1);
  };

  const target = (member: IPagePermissionMember) =>
    member.type === "user"
      ? { pageId: page.id, userId: member.id }
      : { pageId: page.id, groupId: member.id };

  const busy =
    mutations.restrict.isPending || mutations.unrestrict.isPending;

  return (
    <Modal.Root opened={opened} onClose={onClose} size={520}>
      <Modal.Overlay />
      <Modal.Content aria-labelledby={titleId}>
        <Modal.Header>
          <Modal.Title id={titleId}>
            <Group gap={6}>
              {restricted ? <IconLock size={18} /> : <IconUsers size={18} />}
              {t("Page access")}
            </Group>
          </Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body>
          {isLoading || !info ? (
            <Group justify="center" py="lg">
              <Loader size="sm" />
            </Group>
          ) : (
            <Stack gap="md">
              {info.inheritedFrom && (
                <Alert variant="light" icon={<IconInfoCircle size={18} />}>
                  {t("This page inherits restrictions from")}{" "}
                  <Anchor
                    component={Link}
                    to={buildPageUrl(
                      spaceSlug,
                      info.inheritedFrom.slugId,
                      info.inheritedFrom.title,
                    )}
                    onClick={onClose}
                  >
                    {info.inheritedFrom.title || t("untitled")}
                  </Anchor>
                  .{" "}
                  {t("Only people with access to both pages can see it.")}
                </Alert>
              )}

              <div>
                <Text size="sm" fw={500} mb={6}>
                  {t("Who can access this page?")}
                </Text>
                <SegmentedControl
                  fullWidth
                  value={restricted ? "restricted" : "space"}
                  onChange={handleAccessChange}
                  disabled={!canManage || busy}
                  data={[
                    { value: "space", label: t("Everyone in the space") },
                    { value: "restricted", label: t("Only selected people") },
                  ]}
                />
                {!canManage && (
                  <Text size="xs" c="dimmed" mt={6}>
                    {t("Only editors of this page can change its access.")}
                  </Text>
                )}
              </div>

              {restricted && (
                <>
                  {canManage && (
                    <Group align="flex-end" wrap="nowrap" gap="xs">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <MultiMemberSelect
                          key={selectKey}
                          onChange={setSelected}
                        />
                      </div>
                      <Select
                        w={170}
                        data={roleOptions}
                        value={newRole}
                        onChange={(v) => v && setNewRole(v as PagePermissionRole)}
                        allowDeselect={false}
                        aria-label={t("Role")}
                      />
                      <Button
                        onClick={handleAdd}
                        loading={mutations.add.isPending}
                        disabled={selected.length === 0}
                      >
                        {t("Add")}
                      </Button>
                    </Group>
                  )}

                  <Divider />

                  <ScrollArea.Autosize mah={320}>
                    <Stack gap="xs">
                      {members?.items.map((member) => (
                        <Group
                          key={`${member.type}-${member.id}`}
                          justify="space-between"
                          wrap="nowrap"
                        >
                          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                            {member.type === "user" ? (
                              <CustomAvatar
                                avatarUrl={member.avatarUrl}
                                name={member.name}
                                size={28}
                              />
                            ) : (
                              <IconGroupCircle />
                            )}
                            <div style={{ minWidth: 0 }}>
                              <Text size="sm" lineClamp={1}>
                                {member.name}
                              </Text>
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {member.type === "user"
                                  ? member.email
                                  : t("{{count}} members", {
                                      count: member.memberCount,
                                    })}
                              </Text>
                            </div>
                          </Group>
                          <Group gap={4} wrap="nowrap">
                            <Select
                              size="xs"
                              w={140}
                              data={roleOptions}
                              value={member.role}
                              disabled={!canManage}
                              allowDeselect={false}
                              aria-label={t("Role")}
                              onChange={(role) =>
                                role &&
                                mutations.updateRole.mutate({
                                  ...target(member),
                                  role: role as PagePermissionRole,
                                })
                              }
                            />
                            {canManage && (
                              <Tooltip label={t("Remove")} withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  aria-label={t("Remove")}
                                  onClick={() =>
                                    mutations.remove.mutate(target(member))
                                  }
                                >
                                  <IconX size={16} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Group>
                      ))}
                    </Stack>
                  </ScrollArea.Autosize>
                </>
              )}
            </Stack>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
