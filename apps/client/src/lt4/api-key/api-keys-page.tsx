// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > API-Schlüssel: eigene Schlüssel anlegen/widerrufen; Admins sehen alle
// und können die API auf Admins beschränken.
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconCopy, IconKey, IconPlus } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IApiKey } from "./index";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-key-service";

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [access, setAccess] = useState<"write" | "read">("write");
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const restricted = workspace?.settings?.api?.restrictToAdmins === true;
  const showAll = isAdmin && scope === "all";

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["lt4-api-keys", showAll],
    queryFn: () => listApiKeys(showAll),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lt4-api-keys"] });

  const create = async () => {
    if (!name.trim()) {
      notifications.show({ message: t("Please enter a name."), color: "red" });
      return;
    }
    setBusy(true);
    try {
      const expiresAt =
        expiry === "never" ? undefined : new Date(Date.now() + Number(expiry) * 86400_000).toISOString();
      const res = await createApiKey({ name: name.trim(), expiresAt, access });
      setCreateOpen(false);
      setName("");
      setNewToken(res.token);
      refresh();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = (key: IApiKey) =>
    modals.openConfirmModal({
      title: t("Revoke API key"),
      children: (
        <Text size="sm">
          {t("Scripts using “{{name}}” will stop working immediately.", { name: key.name })}
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await revokeApiKey(key.id);
          refresh();
        } catch (err) {
          notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
        }
      },
    });

  const toggleRestrict = async (value: boolean) => {
    try {
      const updated = await updateWorkspace({ restrictApiToAdmins: value });
      setWorkspace(updated);
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    }
  };

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");
  const canCreate = isAdmin || !restricted;

  return (
    <>
      <DocumentTitle title={t("API keys")} />
      <SettingsTitle title={t("API keys")} />
      <Text size="sm" c="dimmed" mb="md">
        {t("API keys let scripts and tools use Docmost in your name, e.g. with the header Authorization: Bearer <key>. A key can do everything you can do.")}
      </Text>

      {isAdmin && (
        <>
          <Group justify="space-between" wrap="nowrap" gap="xl" mb="md">
            <div>
              <Text size="md">{t("Only admins may use the API")}</Text>
              <Text size="sm" c="dimmed">
                {t("Keys of other members stop working while this is on.")}
              </Text>
            </div>
            <Switch
              checked={restricted}
              onChange={(e) => toggleRestrict(e.currentTarget.checked)}
              aria-label={t("Only admins may use the API")}
            />
          </Group>
          <Divider mb="md" />
        </>
      )}

      {!canCreate && (
        <Alert variant="light" color="gray" mb="md">
          {t("An administrator has restricted API access to admins.")}
        </Alert>
      )}

      <Group justify="space-between" mb="sm">
        {isAdmin ? (
          <SegmentedControl
            size="xs"
            value={scope}
            onChange={(v) => setScope(v as "mine" | "all")}
            data={[
              { value: "mine", label: t("My keys") },
              { value: "all", label: t("All keys") },
            ]}
          />
        ) : (
          <span />
        )}
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)} disabled={!canCreate}>
          {t("Create API key")}
        </Button>
      </Group>

      {!isLoading && keys.length === 0 ? (
        <Stack align="center" py="xl" gap={4}>
          <IconKey size={32} stroke={1.3} color="var(--mantine-color-dimmed)" />
          <Text size="sm" c="dimmed">
            {t("No API keys yet")}
          </Text>
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Name")}</Table.Th>
                {showAll && <Table.Th>{t("Owner")}</Table.Th>}
                <Table.Th>{t("Access")}</Table.Th>
                <Table.Th>{t("Expires")}</Table.Th>
                <Table.Th>{t("Last used")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {keys.map((k) => {
                const expired = !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
                return (
                  <Table.Tr key={k.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {k.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t("Created {{date}}", { date: fmt(k.createdAt) })}
                      </Text>
                    </Table.Td>
                    {showAll && <Table.Td>{k.creatorName}</Table.Td>}
                    <Table.Td>
                      <Badge size="sm" variant="light" color={k.scopes?.includes("write") ? "blue" : "gray"}>
                        {k.scopes?.includes("write") ? t("Read and write") : t("Read only")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {expired ? (
                        <Badge size="sm" color="red" variant="light">
                          {t("Expired")}
                        </Badge>
                      ) : (
                        <Text size="sm">{k.expiresAt ? fmt(k.expiresAt) : t("Never")}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{k.lastUsedAt ? fmt(k.lastUsedAt) : t("Never")}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => revoke(k)}>
                        {t("Revoke")}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title={t("Create API key")}>
        <Stack gap="sm">
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. Backup script")}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <Select
            label={t("Access")}
            data={[
              { value: "write", label: t("Read and write") },
              { value: "read", label: t("Read only") },
            ]}
            value={access}
            onChange={(v) => setAccess((v as "read" | "write") ?? "write")}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
          <Select
            label={t("Expires after")}
            data={EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
            value={expiry}
            onChange={(v) => setExpiry(v ?? "90")}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={create} loading={busy}>
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!newToken}
        onClose={() => setNewToken(null)}
        title={t("Your new API key")}
        closeOnClickOutside={false}
        size="lg"
      >
        <Stack gap="sm">
          <Alert variant="light" color="yellow" icon={<IconAlertTriangle size={18} />}>
            {t("Copy the key now. For security reasons it will not be shown again.")}
          </Alert>
          <Code block style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
            {newToken}
          </Code>
          <Group justify="flex-end">
            <CopyButton value={newToken ?? ""}>
              {({ copied, copy }) => (
                <Button
                  variant={copied ? "light" : "filled"}
                  color={copied ? "teal" : undefined}
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onClick={copy}
                >
                  {copied ? t("Copied") : t("Copy")}
                </Button>
              )}
            </CopyButton>
            <Button variant="default" onClick={() => setNewToken(null)}>
              {t("Done")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
