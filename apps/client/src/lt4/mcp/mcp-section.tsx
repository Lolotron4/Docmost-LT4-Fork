// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Einstellungen > API-Schlüssel: MCP-Schnittstelle ein-/ausschalten und
// Anleitung, wie man Claude, Cursor & Co. anbindet.
import {
  Code,
  CopyButton,
  ActionIcon,
  Divider,
  Group,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";

function CopyBlock({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Group gap={4} wrap="nowrap" align="flex-start">
      <Code block style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {value}
      </Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? t("Copied") : t("Copy")}>
            <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export default function McpSection() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const enabled = workspace?.settings?.ai?.mcp === true;
  const url = `${window.location.origin}/mcp`;

  const toggle = async (value: boolean) => {
    try {
      const updated = await updateWorkspace({ mcpEnabled: value });
      setWorkspace(updated);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Error"),
        color: "red",
      });
    }
  };

  const claudeCode = `claude mcp add --transport http lt4-docs ${url} --header "Authorization: Bearer <API-Schlüssel>"`;
  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        "lt4-docs": {
          type: "http",
          url,
          headers: { Authorization: "Bearer <API-Schlüssel>" },
        },
      },
    },
    null,
    2,
  );
  const remoteBridge = JSON.stringify(
    {
      mcpServers: {
        "lt4-docs": {
          command: "npx",
          args: ["-y", "mcp-remote", url, "--header", "Authorization:Bearer <API-Schlüssel>"],
        },
      },
    },
    null,
    2,
  );

  return (
    <>
      <Divider my="xl" />
      <Title order={4} mb="xs">
        {t("MCP interface")}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t(
          "AI tools like Claude, Cursor or VS Code can search, read and write pages via the Model Context Protocol. They use an API key and get exactly the rights of its owner. Read-only keys can only search and read.",
        )}
      </Text>

      {isAdmin && (
        <Group justify="space-between" wrap="nowrap" gap="xl" mb="md">
          <div>
            <Text size="md">{t("Enable MCP interface")}</Text>
            <Text size="sm" c="dimmed">
              {t("Off by default. Members can connect their own AI tools while this is on.")}
            </Text>
          </div>
          <Switch
            checked={enabled}
            onChange={(e) => toggle(e.currentTarget.checked)}
            aria-label={t("Enable MCP interface")}
          />
        </Group>
      )}

      {!enabled ? (
        <Text size="sm" c="dimmed">
          {t("The MCP interface is turned off. An administrator can turn it on here.")}
        </Text>
      ) : (
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t("Server address")}
            </Text>
            <CopyBlock value={url} />
          </div>
          <Text size="sm">
            {t("Create an API key above and replace <API-Schlüssel> with it.")}
          </Text>
          <Tabs defaultValue="claude-code" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="claude-code">Claude Code</Tabs.Tab>
              <Tabs.Tab value="json">Cursor / VS Code</Tabs.Tab>
              <Tabs.Tab value="desktop">Claude Desktop</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="claude-code" pt="sm">
              <CopyBlock value={claudeCode} />
            </Tabs.Panel>
            <Tabs.Panel value="json" pt="sm">
              <Text size="xs" c="dimmed" mb={4}>
                {t("Add this to the MCP configuration file (e.g. .cursor/mcp.json or .vscode/mcp.json):")}
              </Text>
              <CopyBlock value={jsonConfig} />
            </Tabs.Panel>
            <Tabs.Panel value="desktop" pt="sm">
              <Text size="xs" c="dimmed" mb={4}>
                {t("In claude_desktop_config.json (needs Node.js; uses the mcp-remote bridge):")}
              </Text>
              <CopyBlock value={remoteBridge} />
            </Tabs.Panel>
          </Tabs>
          <Text size="xs" c="dimmed">
            {t("Available tools: list_spaces, search_pages, list_pages, get_page, create_page, update_page.")}
          </Text>
        </Stack>
      )}
    </>
  );
}
