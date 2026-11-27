// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > SCIM: Konten und Gruppen automatisch aus Entra ID, Okta,
// Authentik & Co. abgleichen.
import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  List,
  Menu,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDots,
  IconInfoCircle,
  IconKey,
  IconPlus,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  createScimToken,
  deleteScimToken,
  getScimOverview,
  IScimToken,
  scimBaseUrl,
  setScimEnabled,
  setScimTokenEnabled,
} from "./scim-service";

const DOCS_URL =
  "https://github.com/Lolotron4/Docmost-LT4-Fork/blob/main/docs/lt4/scim.md";

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

function CopyField({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" wrap="nowrap">
      <Code style={{ flex: 1, overflowX: "auto", whiteSpace: "nowrap" }} p="xs">
        {value}
      </Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? t("Copied") : t("Copy")}>
            <ActionIcon variant="light" color={copied ? "green" : "gray"} onClick={copy}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export default function ScimSettings() {
  const { t } = useTranslation();
  const { can } = useUserRole();
  const allowed = can("scim");
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lt4-scim"],
    queryFn: getScimOverview,
    enabled: allowed,
  });

  if (!allowed) return <Navigate to="/settings/account/profile" replace />;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lt4-scim"] });
  const fail = (err: unknown) =>
    notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });

  const toggle = async (enabled: boolean) => {
    try {
      await setScimEnabled(enabled);
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const create = async () => {
    if (!name.trim()) {
      notifications.show({ message: t("Please enter a name."), color: "red" });
      return;
    }
    setBusy(true);
    try {
      const res = await createScimToken(name.trim());
      setCreating(false);
      setName("");
      setNewToken(res.token);
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const setTokenEnabled = async (token: IScimToken, enabled: boolean) => {
    try {
      await setScimTokenEnabled(token.id, enabled);
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const remove = (token: IScimToken) =>
    modals.openConfirmModal({
      title: t("Delete SCIM token"),
      children: (
        <Text size="sm">
          {t(
            "The identity provider that uses {{name}} can no longer sync accounts. Accounts that were already created stay.",
            { name: token.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteScimToken(token.id);
          refresh();
        } catch (err) {
          fail(err);
        }
      },
    });

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");
  const tokens = data?.tokens ?? [];
  const enabled = data?.enabled ?? false;

  return (
    <>
      <DocumentTitle title={t("SCIM provisioning")} />
      <SettingsTitle title={t("SCIM provisioning")} />
      <Text size="sm" c="dimmed" mb="md">
        {t(
          "Let your identity provider (Microsoft Entra ID, Okta, Authentik, Keycloak ...) create, update and deactivate accounts and groups automatically via SCIM 2.0.",
        )}{" "}
        <Anchor href={DOCS_URL} target="_blank" size="sm">
          {t("Setup guide")}
        </Anchor>
      </Text>

      <Card withBorder radius="md" padding="md" mb="md">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fw={500}>{t("Enable SCIM")}</Text>
            <Text size="xs" c="dimmed">
              {t("While SCIM is off, every request is refused, even with a valid token.")}
            </Text>
          </div>
          <Switch
            checked={enabled}
            disabled={isLoading}
            onChange={(e) => toggle(e.currentTarget.checked)}
            aria-label={t("Enable SCIM")}
          />
        </Group>
        {data && (
          <Group gap="xs" mt="sm">
            <Badge variant="light" color={enabled ? "green" : "gray"}>
              {enabled ? t("On") : t("Off")}
            </Badge>
            <Badge variant="outline" color="gray">
              {t("{{count}} accounts synced", { count: data.managedUsers })}
            </Badge>
            <Badge variant="outline" color="gray">
              {t("{{count}} groups synced", { count: data.managedGroups })}
            </Badge>
          </Group>
        )}
      </Card>

      <Title order={5} mb={6}>
        {t("SCIM base URL")}
      </Title>
      <Text size="xs" c="dimmed" mb={6}>
        {t("Enter this as tenant URL / SCIM connector base URL in your identity provider.")}
      </Text>
      <CopyField value={scimBaseUrl()} />

      <Group justify="space-between" mt="xl" mb="xs">
        <Title order={5}>{t("Tokens")}</Title>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
          {t("New token")}
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        {t("The identity provider sends the token as bearer token (secret token). Create one token per provider.")}
      </Text>

      {!isLoading && tokens.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          {t("No tokens yet")}
        </Text>
      )}

      <Stack gap="sm">
        {tokens.map((token) => (
          <Card key={token.id} withBorder padding="sm" radius="md">
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap="xs" wrap="nowrap">
                  <IconKey size={16} style={{ flexShrink: 0 }} />
                  <Text fw={500} truncate>
                    {token.name}
                  </Text>
                  <Code>…{token.tokenLastFour}</Code>
                  {!token.isEnabled && (
                    <Badge size="sm" variant="light" color="gray">
                      {t("Paused")}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {t("Created {{time}} by {{name}}", {
                    time: fmt(token.createdAt),
                    name: token.creatorName ?? "–",
                  })}
                  {" · "}
                  {token.lastUsedAt
                    ? t("Last used {{time}}", { time: fmt(token.lastUsedAt) })
                    : t("Never used")}
                </Text>
              </div>
              <Group gap="xs" wrap="nowrap">
                <Switch
                  size="sm"
                  checked={token.isEnabled}
                  onChange={(e) => setTokenEnabled(token, e.currentTarget.checked)}
                  aria-label={t("Active")}
                />
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item color="red" onClick={() => remove(token)}>
                      {t("Delete")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />} mt="xl" title={t("Good to know")}>
        <List size="sm" spacing={4}>
          <List.Item>
            {t("Existing accounts are linked by email address or username instead of being created twice.")}
          </List.Item>
          <List.Item>
            {t("Accounts without an email address get a username, like accounts from join links. They sign in via SSO, LDAP or a password set by an admin.")}
          </List.Item>
          <List.Item>
            {t("Removing someone in the identity provider deactivates the account. Owners can never be deactivated or deleted via SCIM.")}
          </List.Item>
          <List.Item>
            {t("Synced groups work like normal groups: give them a role or space access here, the identity provider manages the members.")}
          </List.Item>
        </List>
      </Alert>

      <Modal opened={creating} onClose={() => setCreating(false)} title={t("New SCIM token")}>
        <Stack>
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. Entra ID school")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
            data-autofocus
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreating(false)}>
              {t("Cancel")}
            </Button>
            <Button loading={busy} onClick={create}>
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!newToken} onClose={() => setNewToken(null)} title={t("Token created")} size="lg">
        <Stack>
          <Alert variant="light" color="yellow" icon={<IconAlertTriangle size={18} />}>
            {t("Copy the token now. It is shown only once.")}
          </Alert>
          {newToken && <CopyField value={newToken} />}
          <Text size="sm" c="dimmed">
            {t("Base URL")}: <Code>{scimBaseUrl()}</Code>
          </Text>
          {!enabled && (
            <Text size="sm" c="orange">
              {t("SCIM is still off. Turn it on above so that the token works.")}
            </Text>
          )}
          <Group justify="flex-end">
            <Button onClick={() => setNewToken(null)}>{t("Done")}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
