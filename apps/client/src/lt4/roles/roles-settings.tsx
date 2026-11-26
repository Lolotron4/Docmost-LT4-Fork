// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  createRole,
  deleteRole,
  ILt4Role,
  ILt4RolesResponse,
  moveRole,
  updateRole,
} from "./roles-service";
import { Lt4Permission, PERMISSION_GROUPS, PERMISSION_LABELS } from "./role-permissions";
import { useRoleLabels, useSetRolesData } from "./use-roles";

type Editing = { mode: "new" } | { mode: "edit"; role: ILt4Role } | null;

const errorMessage = (err: any) => err?.response?.data?.message ?? "Error";

export default function RolesSettings() {
  const { t } = useTranslation();
  const { can, isOwner, role: myRole } = useUserRole();
  const queryClient = useQueryClient();
  const setRolesData = useSetRolesData();
  const { roles, data, nameOf, descriptionOf } = useRoleLabels();

  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<Lt4Permission[]>([]);
  const [deleting, setDeleting] = useState<ILt4Role | null>(null);
  const [replacement, setReplacement] = useState<string>("member");
  const [busy, setBusy] = useState(false);

  if (!can("roles")) return <Navigate to="/settings/account/profile" replace />;

  const myPermissions = data?.myPermissions ?? [];
  const canGrant = (p: Lt4Permission) => isOwner || myPermissions.includes(p);

  const applyResult = (res: ILt4RolesResponse) => {
    setRolesData(res);
    // eigene Rechte könnten sich geändert haben
    queryClient.invalidateQueries({ queryKey: ["currentUser"] });
  };

  const run = async (fn: () => Promise<ILt4RolesResponse>) => {
    setBusy(true);
    try {
      applyResult(await fn());
      return true;
    } catch (err) {
      notifications.show({ message: t(errorMessage(err)), color: "red" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openNew = () => {
    setName("");
    setDescription("");
    setPerms([]);
    setEditing({ mode: "new" });
  };

  const openEdit = (role: ILt4Role) => {
    setName(nameOf(role));
    setDescription(role.description ?? "");
    setPerms(role.permissions);
    setEditing({ mode: "edit", role });
  };

  const save = async () => {
    if (!name.trim()) {
      notifications.show({ message: t("Please enter a name."), color: "red" });
      return;
    }
    const ok = await run(() =>
      editing?.mode === "edit"
        ? updateRole({
            key: editing.role.key,
            // Unveränderte eingebaute Namen nicht als Übersetzung speichern
            name: name === nameOf(editing.role) ? editing.role.name : name,
            description,
            permissions: perms,
          })
        : createRole({ name, description, permissions: perms }),
    );
    if (ok) setEditing(null);
  };

  const openDelete = (role: ILt4Role) => {
    const options = roles.filter(
      (r) => r.key !== role.key && r.key !== "owner" && r.editable,
    );
    setReplacement(
      options.find((r) => r.key === "member")?.key ?? options[0]?.key ?? "member",
    );
    setDeleting(role);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await run(() =>
      deleteRole({ key: deleting.key, replacementKey: replacement }),
    );
    if (ok) setDeleting(null);
  };

  const isOwnerRole = editing?.mode === "edit" && editing.role.key === "owner";

  return (
    <>
      <DocumentTitle title={t("Roles")} />
      <SettingsTitle title={t("Roles")} />

      <Alert variant="light" icon={<IconInfoCircle />} mb="md">
        {t(
          "Roles are ordered from top to bottom. The owner can change everything. Everyone else with the right to manage roles can only edit, rename and move roles below their own role, and can only grant rights they have themselves.",
        )}
      </Alert>

      <Group justify="flex-end" mb="sm">
        <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
          {t("Create role")}
        </Button>
      </Group>

      <Stack gap="xs">
        {roles.map((role, index) => {
          const prev = roles[index - 1];
          const next = roles[index + 1];
          const canUp =
            role.editable && role.key !== "owner" && prev && prev.key !== "owner" && prev.editable;
          const canDown = role.editable && role.key !== "owner" && next && next.editable;
          const isMine = role.key === myRole;
          return (
            <Paper key={role.key} withBorder p="sm" radius="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                  <Text c="dimmed" fw={600} w={24} ta="right">
                    {index + 1}.
                  </Text>
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Text fw={600}>{nameOf(role)}</Text>
                      {role.isSystem && (
                        <Badge size="xs" variant="light" color="gray">
                          {t("Built-in")}
                        </Badge>
                      )}
                      {isMine && (
                        <Badge size="xs" variant="light">
                          {t("Your role")}
                        </Badge>
                      )}
                      {!role.editable && (
                        <Tooltip label={t("Only roles below your own role can be edited")}>
                          <IconLock size={14} style={{ opacity: 0.5 }} />
                        </Tooltip>
                      )}
                    </Group>
                    {descriptionOf(role) && (
                      <Text size="xs" c="dimmed">
                        {descriptionOf(role)}
                      </Text>
                    )}
                    <Group gap={4} mt={6}>
                      {role.permissions.length === 0 ? (
                        <Text size="xs" c="dimmed">
                          {t("No management rights")}
                        </Text>
                      ) : (
                        role.permissions.map((p) => (
                          <Badge key={p} size="xs" variant="outline" color="gray">
                            {t(PERMISSION_LABELS[p]?.label ?? p)}
                          </Badge>
                        ))
                      )}
                    </Group>
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" mr="xs" style={{ whiteSpace: "nowrap" }}>
                    {t("{{count}} members", { count: role.userCount })}
                  </Text>
                  <Tooltip label={t("Move up")}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      disabled={!canUp || busy}
                      onClick={() => run(() => moveRole({ key: role.key, direction: "up" }))}
                      aria-label={t("Move up")}
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("Move down")}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      disabled={!canDown || busy}
                      onClick={() => run(() => moveRole({ key: role.key, direction: "down" }))}
                      aria-label={t("Move down")}
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("Edit")}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      disabled={!role.editable}
                      onClick={() => openEdit(role)}
                      aria-label={t("Edit")}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={role.isSystem ? t("Built-in roles cannot be deleted") : t("Delete")}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      disabled={!role.editable || role.isSystem}
                      onClick={() => openDelete(role)}
                      aria-label={t("Delete")}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>

      <Modal
        opened={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.mode === "edit" ? t("Edit role") : t("Create role")}
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            label={t("Name")}
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <Textarea
            label={t("Description")}
            value={description}
            maxLength={300}
            autosize
            minRows={2}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Text fw={500} size="sm" mt="xs">
            {t("Rights")}
          </Text>
          {isOwnerRole ? (
            <Text size="sm" c="dimmed">
              {t("The owner always has all rights.")}
            </Text>
          ) : (
            <Stack gap={8}>
              {PERMISSION_GROUPS.map((group) => (
                <Stack key={group.label} gap={8}>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    {t(group.label)}
                  </Text>
                  {group.items.map((p) => (
                    <Checkbox
                      key={p}
                      label={t(PERMISSION_LABELS[p].label)}
                      description={
                        canGrant(p)
                          ? t(PERMISSION_LABELS[p].description)
                          : t("You can only grant rights you have yourself.")
                      }
                      checked={perms.includes(p)}
                      disabled={!canGrant(p)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setPerms((cur) =>
                          checked ? [...cur, p] : cur.filter((x) => x !== p),
                        );
                      }}
                    />
                  ))}
                </Stack>
              ))}
              <Text size="xs" c="dimmed">
                {t(
                  "Everyone can always read pages and spaces they have access to, upload files and create their own API keys.",
                )}
              </Text>
            </Stack>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setEditing(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={t("Delete role")}
      >
        {deleting && (
          <Stack gap="sm">
            <Text size="sm">
              {t("Delete the role {{name}}?", { name: nameOf(deleting) })}
            </Text>
            {deleting.userCount > 0 && (
              <Select
                label={t("Members with this role get the role")}
                data={roles
                  .filter((r) => r.key !== deleting.key && r.key !== "owner" && r.editable)
                  .map((r) => ({ value: r.key, label: nameOf(r) }))}
                value={replacement}
                onChange={(v) => v && setReplacement(v)}
                allowDeselect={false}
              />
            )}
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={() => setDeleting(null)}>
                {t("Cancel")}
              </Button>
              <Button color="red" onClick={confirmDelete} loading={busy}>
                {t("Delete")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
